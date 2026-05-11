import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { colors } from '../theme';
import { VoiceInfo, getAvailableVoices, speak, stop } from '../services/ttsService';

const SAMPLE_TEXT = 'The spice extends life. The spice expands consciousness.';

interface Props {
  visible: boolean;
  selectedVoiceId?: string;
  ttsRate: number;
  ttsPitch: number;
  onVoiceSelect: (voiceId: string) => void;
  onRateChange: (rate: number) => void;
  onPitchChange: (pitch: number) => void;
  onClose: () => void;
}

const RATES = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
const PITCHES = [0.75, 1.0, 1.25];

export default function VoicePickerSheet({
  visible,
  selectedVoiceId,
  ttsRate,
  ttsPitch,
  onVoiceSelect,
  onRateChange,
  onPitchChange,
  onClose,
}: Props) {
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      getAvailableVoices().then(v => {
        // Prefer English voices, de-dupe by name
        const en = v.filter(x => x.language.startsWith('en'));
        setVoices(en.length > 0 ? en : v.slice(0, 12));
      });
    }
  }, [visible]);

  async function playSample(voice: VoiceInfo) {
    if (playingId === voice.id) {
      await stop();
      setPlayingId(null);
      return;
    }
    setPlayingId(voice.id);
    await speak(SAMPLE_TEXT, {
      voice: voice.id,
      rate: ttsRate,
      pitch: ttsPitch,
      onDone: () => setPlayingId(null),
      onError: () => setPlayingId(null),
    });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <SafeAreaView style={styles.sheetContainer} pointerEvents="box-none">
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Choose a voice</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.done}>Done</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>Tap ▸ to hear a sample · tap card to select</Text>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.voiceList}>
            <View style={styles.grid}>
              {voices.map(v => {
                const active = v.id === selectedVoiceId;
                const playing = v.id === playingId;
                return (
                  <TouchableOpacity
                    key={v.id}
                    style={[styles.voiceCard, active && styles.voiceCardActive]}
                    onPress={() => onVoiceSelect(v.id)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.cardTop}>
                      <Text style={[styles.voiceName, active && styles.accentText]} numberOfLines={1}>
                        {v.name.split('-')[0]}
                      </Text>
                      {active && <Text style={styles.check}>✓</Text>}
                    </View>
                    <Text style={styles.voiceLang} numberOfLines={1}>{v.language}</Text>
                    <TouchableOpacity
                      style={styles.playBtn}
                      onPress={() => playSample(v)}
                    >
                      <Text style={[styles.playIcon, active && styles.accentText]}>
                        {playing ? '■' : '▸'}
                      </Text>
                      <Text style={styles.sampleLabel}>sample</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Speed row */}
          <View style={styles.controlSection}>
            <View style={styles.divider} />
            <Text style={styles.controlLabel}>speed</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rateScroll}>
              {RATES.map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.rateChip, ttsRate === r && styles.rateChipActive]}
                  onPress={() => onRateChange(r)}
                >
                  <Text style={[styles.rateText, ttsRate === r && styles.accentText]}>{r}×</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={[styles.controlLabel, { marginTop: 8 }]}>pitch</Text>
            <View style={styles.pitchRow}>
              {PITCHES.map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.rateChip, ttsPitch === p && styles.rateChipActive]}
                  onPress={() => onPitchChange(p)}
                >
                  <Text style={[styles.rateText, ttsPitch === p && styles.accentText]}>
                    {p === 1.0 ? 'normal' : p < 1 ? 'lower' : 'higher'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26,26,26,0.4)',
  },
  sheetContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '90%',
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.ink3,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
  },
  done: {
    fontSize: 16,
    color: colors.accent,
    fontWeight: '600',
  },
  hint: {
    fontSize: 11,
    color: colors.ink2,
    marginBottom: 10,
  },
  voiceList: {
    maxHeight: 280,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  voiceCard: {
    width: '47%',
    borderWidth: 1,
    borderColor: colors.ink3,
    borderRadius: 8,
    padding: 10,
    gap: 4,
    backgroundColor: colors.paper,
  },
  voiceCardActive: {
    borderColor: colors.accent,
    borderWidth: 1.5,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  voiceName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
    flex: 1,
  },
  check: {
    fontSize: 12,
    color: colors.accent,
  },
  voiceLang: {
    fontSize: 10,
    color: colors.ink2,
  },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  playIcon: {
    fontSize: 14,
    color: colors.ink2,
  },
  sampleLabel: {
    fontSize: 10,
    color: colors.ink3,
  },
  accentText: {
    color: colors.accent,
  },
  controlSection: {
    marginTop: 8,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.ink3,
    marginBottom: 10,
  },
  controlLabel: {
    fontSize: 11,
    color: colors.ink2,
    marginBottom: 6,
  },
  rateScroll: {
    flexGrow: 0,
  },
  rateChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.ink3,
    marginRight: 6,
  },
  rateChipActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(217,106,46,0.08)',
  },
  rateText: {
    fontSize: 13,
    color: colors.ink2,
    fontWeight: '500',
  },
  pitchRow: {
    flexDirection: 'row',
    gap: 8,
  },
});
