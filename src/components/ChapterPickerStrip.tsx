import React, { useRef } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { Chapter } from '../types/epub';

interface Props {
  chapters: Chapter[];
  currentChapter: number;
  onChapterSelect: (index: number) => void;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '—';
  const m = Math.round(seconds / 60);
  return `${m} min`;
}

export default function ChapterPickerStrip({ chapters, currentChapter, onChapterSelect }: Props) {
  const scrollRef = useRef<ScrollView>(null);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {chapters.map((ch, i) => {
        const active = i === currentChapter;
        return (
          <Pressable
            key={ch.id}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChapterSelect(i)}
          >
            <Text style={[styles.chipNum, active && styles.chipTextActive]}>
              ch {i + 1}
            </Text>
            <Text
              style={[styles.chipDur, active && styles.chipTextActive]}
              numberOfLines={1}
            >
              {active ? 'now' : formatDuration(ch.durationEstimate)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    flexDirection: 'row',
  },
  chip: {
    width: 68,
    height: 40,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.ink3,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  chipActive: {
    borderColor: colors.accent,
    borderWidth: 1.5,
  },
  chipNum: {
    fontSize: 9,
    color: colors.ink2,
  },
  chipDur: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.ink,
  },
  chipTextActive: {
    color: colors.accent,
    fontWeight: '700',
  },
});
