import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Slider from '@react-native-community/slider';
import { colors } from '../theme';
import LyricsView from '../components/LyricsView';
import ChapterPickerStrip from '../components/ChapterPickerStrip';
import TOCSheet from '../components/TOCSheet';
import VoicePickerSheet from '../components/VoicePickerSheet';
import { parseEpub } from '../services/epubParser';
import { speak, stop, DEFAULT_KOKORO_VOICE } from '../services/ttsService';
import { savePosition, loadPosition, getSettings, saveSettings, addToLibrary } from '../services/storage';
import { ParsedBook, ReadingPosition } from '../types/epub';
import { RootStackParamList } from '../navigation/AppNavigator';

type Route = RouteProp<RootStackParamList, 'Reader'>;
type Nav = NativeStackNavigationProp<RootStackParamList, 'Reader'>;

export default function ReaderScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { filePath } = route.params;

  const [book, setBook] = useState<ParsedBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [chapterIndex, setChapterIndex] = useState(0);
  const [paragraphIndex, setParagraphIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showTOC, setShowTOC] = useState(false);
  const [showVoice, setShowVoice] = useState(false);

  const [voiceId, setVoiceId] = useState<string>(DEFAULT_KOKORO_VOICE);
  const [ttsRate, setTtsRate] = useState(1.0);
  const [ttsPitch, setTtsPitch] = useState(1.0);
  const [fontSize, setFontSize] = useState(18);

  const playingRef = useRef(false);
  const chapterRef = useRef(chapterIndex);
  const paragraphRef = useRef(paragraphIndex);
  const bookRef = useRef<ParsedBook | null>(null);

  useEffect(() => { chapterRef.current = chapterIndex; }, [chapterIndex]);
  useEffect(() => { paragraphRef.current = paragraphIndex; }, [paragraphIndex]);

  // Load book and restore position
  useEffect(() => {
    (async () => {
      try {
        const [parsedBook, savedPos, settings] = await Promise.all([
          parseEpub(filePath),
          loadPosition(filePath),
          getSettings(),
        ]);
        bookRef.current = parsedBook;
        setBook(parsedBook);
        setVoiceId(settings.voiceId ?? DEFAULT_KOKORO_VOICE);
        setTtsRate(settings.ttsRate);
        setTtsPitch(settings.ttsPitch);
        setFontSize(settings.fontSize);

        if (savedPos) {
          setChapterIndex(savedPos.chapterIndex);
          setParagraphIndex(savedPos.paragraphIndex);
          chapterRef.current = savedPos.chapterIndex;
          paragraphRef.current = savedPos.paragraphIndex;
        }

        // Update library entry with latest parsed data
        await addToLibrary({
          filePath,
          title: parsedBook.metadata.title,
          author: parsedBook.metadata.author,
          coverBase64: parsedBook.metadata.coverImageBase64,
          lastOpened: Date.now(),
          totalChapters: parsedBook.chapters.length,
        });
      } catch (err) {
        setLoadError(String(err));
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      stop();
      playingRef.current = false;
    };
  }, [filePath]);

  // Save position on changes
  useEffect(() => {
    if (book) {
      savePosition(filePath, { chapterIndex, paragraphIndex });
    }
  }, [chapterIndex, paragraphIndex, book, filePath]);

  const currentChapter = book?.chapters[chapterIndex];
  const paragraphs = currentChapter?.paragraphs ?? [];
  const totalParagraphs = paragraphs.length;
  const chapterProgress = totalParagraphs > 0 ? paragraphIndex / (totalParagraphs - 1) : 0;
  const totalChapters = book?.chapters.length ?? 0;
  const bookProgress = totalChapters > 0
    ? (chapterIndex + chapterProgress) / totalChapters
    : 0;

  const speakParagraph = useCallback((chapIdx: number, paraIdx: number, pb: ParsedBook) => {
    const ch = pb.chapters[chapIdx];
    if (!ch) { playingRef.current = false; setIsPlaying(false); return; }
    const text = ch.paragraphs[paraIdx];
    if (!text) {
      // Chapter done — go to next
      const nextChap = chapIdx + 1;
      if (nextChap < pb.chapters.length) {
        chapterRef.current = nextChap;
        paragraphRef.current = 0;
        setChapterIndex(nextChap);
        setParagraphIndex(0);
        if (playingRef.current) speakParagraph(nextChap, 0, pb);
      } else {
        playingRef.current = false;
        setIsPlaying(false);
      }
      return;
    }

    speak(text, {
      voice: voiceId,
      rate: ttsRate,
      pitch: ttsPitch,
      onDone: () => {
        if (!playingRef.current) return;
        const nextPara = paraIdx + 1;
        paragraphRef.current = nextPara;
        setParagraphIndex(nextPara);
        speakParagraph(chapIdx, nextPara, pb);
      },
      onError: () => {
        playingRef.current = false;
        setIsPlaying(false);
      },
    });
  }, [voiceId, ttsRate, ttsPitch]);

  const togglePlay = useCallback(async () => {
    if (!book) return;
    if (playingRef.current) {
      playingRef.current = false;
      setIsPlaying(false);
      await stop();
    } else {
      playingRef.current = true;
      setIsPlaying(true);
      speakParagraph(chapterRef.current, paragraphRef.current, book);
    }
  }, [book, speakParagraph]);

  const jumpToParagraph = useCallback(async (idx: number) => {
    if (!book) return;
    const wasPlaying = playingRef.current;
    await stop();
    paragraphRef.current = idx;
    setParagraphIndex(idx);
    if (wasPlaying) {
      speakParagraph(chapterRef.current, idx, book);
    }
  }, [book, speakParagraph]);

  const jumpToChapter = useCallback(async (idx: number) => {
    if (!book) return;
    const wasPlaying = playingRef.current;
    await stop();
    chapterRef.current = idx;
    paragraphRef.current = 0;
    setChapterIndex(idx);
    setParagraphIndex(0);
    if (wasPlaying) {
      speakParagraph(idx, 0, book);
    }
  }, [book, speakParagraph]);

  const skipBack = useCallback(async () => {
    if (!book) return;
    const target = Math.max(0, paragraphRef.current - 1);
    await jumpToParagraph(target);
  }, [book, jumpToParagraph]);

  const skipForward = useCallback(async () => {
    if (!book) return;
    const target = Math.min(paragraphs.length - 1, paragraphRef.current + 1);
    await jumpToParagraph(target);
  }, [book, paragraphs.length, jumpToParagraph]);

  async function handleChapterSlider(value: number) {
    if (!book) return;
    const targetPara = Math.round(value * (totalParagraphs - 1));
    await jumpToParagraph(targetPara);
  }

  async function handleVoiceChange(id: string) {
    setVoiceId(id);
    await saveSettings({ voiceId: id });
    if (playingRef.current && book) {
      await stop();
      setTimeout(() => speakParagraph(chapterRef.current, paragraphRef.current, book), 100);
    }
  }

  async function handleRateChange(rate: number) {
    setTtsRate(rate);
    await saveSettings({ ttsRate: rate });
  }

  async function handlePitchChange(pitch: number) {
    setTtsPitch(pitch);
    await saveSettings({ ttsPitch: pitch });
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Parsing epub…</Text>
      </View>
    );
  }

  if (loadError || !book) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load book</Text>
        <Text style={styles.errorDetail}>{loadError}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.retryBtnText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tocButton} onPress={() => setShowTOC(true)}>
          <Text style={styles.topBookTitle} numberOfLines={1}>{book.metadata.title}</Text>
          <View style={styles.tocRow}>
            <Text style={styles.topChapterTitle} numberOfLines={1}>
              {currentChapter?.title ?? ''}
            </Text>
            <Text style={styles.chevron}>▾</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowVoice(true)} style={styles.voiceBtn}>
          <Text style={styles.voiceBtnIcon}>🎙</Text>
        </TouchableOpacity>
      </View>

      {/* Lyrics — the main Spotify-style view */}
      <View style={styles.lyricsContainer}>
        <LyricsView
          paragraphs={paragraphs}
          activeIndex={paragraphIndex}
          fontSize={fontSize}
          onParagraphPress={jumpToParagraph}
        />
      </View>

      {/* Chapter scrubber */}
      <View style={styles.scrubberSection}>
        <View style={styles.scrubberTimes}>
          <Text style={styles.timeText}>
            {formatTime(paragraphIndex * ((currentChapter?.durationEstimate ?? 0) / Math.max(1, totalParagraphs)))}
          </Text>
          <Text style={styles.timeText}>
            -{formatTime((totalParagraphs - 1 - paragraphIndex) * ((currentChapter?.durationEstimate ?? 0) / Math.max(1, totalParagraphs)))}
          </Text>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={1}
          value={chapterProgress}
          onSlidingComplete={handleChapterSlider}
          minimumTrackTintColor={colors.accent}
          maximumTrackTintColor={colors.ink3}
          thumbTintColor={colors.accent}
        />
      </View>

      {/* Chapter strip */}
      <ChapterPickerStrip
        chapters={book.chapters}
        currentChapter={chapterIndex}
        onChapterSelect={jumpToChapter}
      />

      {/* Transport controls */}
      <View style={styles.transport}>
        <TouchableOpacity onPress={skipBack} style={styles.transportBtn}>
          <Text style={styles.transportIcon}>⏮</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={togglePlay} style={styles.playButton}>
          <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={skipForward} style={styles.transportBtn}>
          <Text style={styles.transportIcon}>⏭</Text>
        </TouchableOpacity>
      </View>

      {/* Book progress — thin passive bar at bottom */}
      <View style={styles.bookProgressSection}>
        <View style={styles.bookProgressRow}>
          <Text style={styles.bookProgressLabel}>book</Text>
          <Text style={styles.bookProgressPct}>{Math.round(bookProgress * 100)}%</Text>
        </View>
        <View style={styles.bookProgressTrack}>
          <View style={[styles.bookProgressFill, { width: `${bookProgress * 100}%` }]} />
        </View>
      </View>

      <TOCSheet
        visible={showTOC}
        chapters={book.chapters}
        currentChapter={chapterIndex}
        chapterProgress={chapterProgress}
        onChapterSelect={jumpToChapter}
        onClose={() => setShowTOC(false)}
      />

      <VoicePickerSheet
        visible={showVoice}
        selectedVoiceId={voiceId}
        ttsRate={ttsRate}
        ttsPitch={ttsPitch}
        onVoiceSelect={handleVoiceChange}
        onRateChange={handleRateChange}
        onPitchChange={handlePitchChange}
        onClose={() => setShowVoice(false)}
      />
    </SafeAreaView>
  );
}

function formatTime(seconds: number): string {
  const s = Math.round(Math.max(0, seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
    gap: 12,
    padding: 24,
  },
  loadingText: {
    fontSize: 14,
    color: colors.ink2,
    marginTop: 12,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
  },
  errorDetail: {
    fontSize: 13,
    color: colors.ink2,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 16,
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryBtnText: {
    color: colors.paper,
    fontSize: 15,
    fontWeight: '600',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.paperDark,
  },
  backBtn: {
    padding: 8,
  },
  backIcon: {
    fontSize: 28,
    color: colors.ink,
    lineHeight: 32,
  },
  tocButton: {
    flex: 1,
    paddingHorizontal: 8,
  },
  tocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  topBookTitle: {
    fontSize: 10,
    color: colors.ink2,
    letterSpacing: 0.2,
  },
  topChapterTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
    flex: 1,
  },
  chevron: {
    fontSize: 11,
    color: colors.ink2,
  },
  voiceBtn: {
    padding: 8,
  },
  voiceBtnIcon: {
    fontSize: 20,
  },
  lyricsContainer: {
    flex: 1,
  },
  scrubberSection: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  scrubberTimes: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  timeText: {
    fontSize: 10,
    color: colors.ink2,
  },
  slider: {
    width: '100%',
    height: 32,
  },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 28,
  },
  transportBtn: {
    padding: 8,
  },
  transportIcon: {
    fontSize: 26,
    color: colors.ink,
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  playIcon: {
    fontSize: 22,
    color: colors.paper,
    marginLeft: 2,
  },
  bookProgressSection: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    paddingTop: 4,
  },
  bookProgressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  bookProgressLabel: {
    fontSize: 9,
    color: colors.ink3,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  bookProgressPct: {
    fontSize: 9,
    color: colors.ink3,
  },
  bookProgressTrack: {
    height: 2,
    backgroundColor: colors.ink3,
    borderRadius: 1,
    overflow: 'hidden',
  },
  bookProgressFill: {
    height: '100%',
    backgroundColor: colors.ink2,
    borderRadius: 1,
  },
});
