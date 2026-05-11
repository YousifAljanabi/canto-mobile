import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  Dimensions,
  Platform,
} from 'react-native';
import { colors } from '../theme';

const { height: SCREEN_H } = Dimensions.get('window');
const ITEM_PADDING = 16;

interface Props {
  paragraphs: string[];
  activeIndex: number;
  fontSize?: number;
  onParagraphPress?: (index: number) => void;
}

interface ParagraphItem {
  text: string;
  index: number;
}

function ParagraphRow({
  item,
  isActive,
  distance,
  fontSize,
  onPress,
}: {
  item: ParagraphItem;
  isActive: boolean;
  distance: number;
  fontSize: number;
  onPress: () => void;
}) {
  const opacity = isActive ? 1 : Math.max(0.18, 0.55 - distance * 0.1);
  const color = isActive ? colors.accent : colors.ink;
  const fontWeight = isActive ? '700' : '400';
  const scale = isActive ? 1.02 : 1;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.paraContainer, { paddingVertical: isActive ? 14 : 10 }]}
    >
      <Text
        style={[
          styles.paraText,
          {
            fontSize: isActive ? fontSize + 1 : fontSize,
            opacity,
            color,
            fontWeight,
            transform: [{ scale }],
          },
        ]}
      >
        {item.text}
      </Text>
    </Pressable>
  );
}

export default function LyricsView({ paragraphs, activeIndex, fontSize = 18, onParagraphPress }: Props) {
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (paragraphs.length === 0) return;
    const idx = Math.min(activeIndex, paragraphs.length - 1);
    // Small delay so layout is done before scroll
    setTimeout(() => {
      listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.35 });
    }, 80);
  }, [activeIndex, paragraphs.length]);

  const data: ParagraphItem[] = paragraphs.map((text, index) => ({ text, index }));

  const getItemLayout = (_: any, index: number) => ({
    length: 80,
    offset: 80 * index,
    index,
  });

  return (
    <FlatList
      ref={listRef}
      data={data}
      keyExtractor={item => String(item.index)}
      renderItem={({ item }) => {
        const distance = Math.abs(item.index - activeIndex);
        return (
          <ParagraphRow
            item={item}
            isActive={item.index === activeIndex}
            distance={distance}
            fontSize={fontSize}
            onPress={() => onParagraphPress?.(item.index)}
          />
        );
      }}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      onScrollToIndexFailed={info => {
        setTimeout(() => {
          listRef.current?.scrollToIndex({
            index: Math.min(info.index, paragraphs.length - 1),
            animated: true,
            viewPosition: 0.35,
          });
        }, 200);
      }}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 24,
    paddingVertical: SCREEN_H * 0.25,
  },
  paraContainer: {
    paddingHorizontal: ITEM_PADDING,
  },
  paraText: {
    lineHeight: 26,
    textAlign: 'left',
    letterSpacing: -0.2,
  },
});
