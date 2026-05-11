import React, { useCallback } from 'react';
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
import { Chapter } from '../types/epub';

interface Props {
  visible: boolean;
  chapters: Chapter[];
  currentChapter: number;
  chapterProgress: number; // 0-1
  onChapterSelect: (index: number) => void;
  onClose: () => void;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '—';
  const m = Math.round(seconds / 60);
  return `${m} min`;
}

export default function TOCSheet({ visible, chapters, currentChapter, chapterProgress, onChapterSelect, onClose }: Props) {
  const handleSelect = useCallback((i: number) => {
    onChapterSelect(i);
    onClose();
  }, [onChapterSelect, onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <SafeAreaView style={styles.sheetContainer} pointerEvents="box-none">
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Contents</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.done}>Done</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {chapters.map((ch, i) => {
              const active = i === currentChapter;
              return (
                <TouchableOpacity
                  key={ch.id}
                  style={[styles.row, active && styles.rowActive]}
                  onPress={() => handleSelect(i)}
                  activeOpacity={0.7}
                >
                  <View style={styles.rowNum}>
                    <Text style={[styles.numText, active && styles.activeText]}>
                      {i + 1}.
                    </Text>
                  </View>
                  <View style={styles.rowContent}>
                    <Text
                      style={[styles.chapterTitle, active && styles.activeText]}
                      numberOfLines={2}
                    >
                      {ch.title}
                    </Text>
                    {active && (
                      <View style={styles.progressRow}>
                        <View style={styles.progressTrack}>
                          <View style={[styles.progressFill, { width: `${chapterProgress * 100}%` }]} />
                        </View>
                        <Text style={styles.progressPct}>{Math.round(chapterProgress * 100)}%</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.dur}>{formatDuration(ch.durationEstimate)}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26,26,26,0.35)',
  },
  sheetContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.ink3,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.ink3,
    marginBottom: 4,
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
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.paperDark,
  },
  rowActive: {
    // no extra bg, color change is enough
  },
  rowNum: {
    width: 28,
    paddingTop: 1,
  },
  numText: {
    fontSize: 13,
    color: colors.ink2,
  },
  rowContent: {
    flex: 1,
    marginRight: 8,
  },
  chapterTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.ink,
    lineHeight: 20,
  },
  activeText: {
    color: colors.accent,
    fontWeight: '700',
  },
  dur: {
    fontSize: 11,
    color: colors.ink3,
    paddingTop: 2,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    backgroundColor: colors.ink3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 2,
  },
  progressPct: {
    fontSize: 10,
    color: colors.ink3,
  },
});
