import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  Modal,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { colors } from '../theme';
import { ContentItem } from '../types/epub';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── Rich content renderers ─────────────────────────────────────────────────

function CodeBlock({ content, language }: { content: string; language?: string }) {
  return (
    <View style={styles.codeContainer}>
      {language && <Text style={styles.codeLang}>{language}</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator style={styles.codeScroll}>
        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
          <Text style={styles.codeText} selectable>{content}</Text>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

function TableBlock({ rows }: { rows: string[][] }) {
  const hasHeader = rows.length > 1;
  return (
    <View style={styles.tableContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          {rows.map((row, ri) => (
            <View key={ri} style={[styles.tableRow, ri === 0 && hasHeader && styles.tableHeaderRow]}>
              {row.map((cell, ci) => (
                <View key={ci} style={styles.tableCell}>
                  <Text
                    style={[styles.tableCellText, ri === 0 && hasHeader && styles.tableHeaderText]}
                    numberOfLines={3}
                  >
                    {cell}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function ImageBlock({ base64, mimeType, alt }: { base64: string; mimeType: string; alt?: string }) {
  const [zoomed, setZoomed] = useState(false);
  const uri = `data:${mimeType};base64,${base64}`;

  return (
    <>
      <TouchableOpacity style={styles.imageContainer} onPress={() => setZoomed(true)} activeOpacity={0.9}>
        <Image source={{ uri }} style={styles.imageThumbnail} resizeMode="contain" />
        {alt ? <Text style={styles.imageAlt}>{alt}</Text> : null}
        <Text style={styles.imageHint}>tap to zoom</Text>
      </TouchableOpacity>

      <Modal visible={zoomed} transparent animationType="fade" onRequestClose={() => setZoomed(false)}>
        <Pressable style={styles.zoomBackdrop} onPress={() => setZoomed(false)}>
          <Image source={{ uri }} style={styles.zoomImage} resizeMode="contain" />
        </Pressable>
      </Modal>
    </>
  );
}

// ─── Paragraph row ──────────────────────────────────────────────────────────

interface RowProps {
  item: ContentItem;
  index: number;
  activeIndex: number;
  fontSize: number;
  onPress: () => void;
}

function ContentRow({ item, index, activeIndex, fontSize, onPress }: RowProps) {
  if (item.type === 'code') return <CodeBlock content={item.content} language={item.language} />;
  if (item.type === 'table') return <TableBlock rows={item.rows} />;
  if (item.type === 'image') return <ImageBlock base64={item.base64} mimeType={item.mimeType} alt={item.alt} />;

  // text
  const distance = Math.abs(index - activeIndex);
  const isActive = index === activeIndex;
  const opacity = isActive ? 1 : Math.max(0.18, 0.55 - distance * 0.1);

  return (
    <Pressable onPress={onPress} style={[styles.paraContainer, isActive && styles.paraActive]}>
      <Text
        style={[
          styles.paraText,
          {
            fontSize: isActive ? fontSize + 1 : fontSize,
            opacity,
            color: isActive ? colors.accent : colors.ink,
            fontWeight: isActive ? '700' : '400',
          },
        ]}
      >
        {item.content}
      </Text>
    </Pressable>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

interface Props {
  items: ContentItem[];
  activeIndex: number;
  fontSize?: number;
  onItemPress?: (index: number) => void;
}

export default function LyricsView({ items, activeIndex, fontSize = 18, onItemPress }: Props) {
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (items.length === 0) return;
    const idx = Math.min(Math.max(0, activeIndex || 0), items.length - 1);
    if (!Number.isFinite(idx)) return;
    setTimeout(() => {
      listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.35 });
    }, 80);
  }, [activeIndex, items.length]);

  return (
    <FlatList
      ref={listRef}
      data={items}
      keyExtractor={(_, i) => String(i)}
      renderItem={({ item, index }) => (
        <ContentRow
          item={item}
          index={index}
          activeIndex={activeIndex}
          fontSize={fontSize}
          onPress={() => {
            if (item.type === 'text') onItemPress?.(index);
          }}
        />
      )}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      onScrollToIndexFailed={info => {
        setTimeout(() => {
          listRef.current?.scrollToIndex({
            index: Math.min(info.index, items.length - 1),
            animated: true,
            viewPosition: 0.35,
          });
        }, 200);
      }}
    />
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 24,
    paddingVertical: SCREEN_H * 0.25,
    gap: 4,
  },
  paraContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  paraActive: {
    paddingVertical: 14,
  },
  paraText: {
    lineHeight: 26,
    letterSpacing: -0.2,
  },

  // Code
  codeContainer: {
    marginVertical: 12,
    marginHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.ink3,
    overflow: 'hidden',
    backgroundColor: colors.paperDark,
  },
  codeLang: {
    fontSize: 10,
    color: colors.ink2,
    paddingHorizontal: 12,
    paddingTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  codeScroll: {
    maxHeight: 260,
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: colors.ink,
    padding: 12,
    lineHeight: 18,
  },

  // Table
  tableContainer: {
    marginVertical: 12,
    marginHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.ink3,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.ink3,
  },
  tableHeaderRow: {
    backgroundColor: colors.paperDark,
  },
  tableCell: {
    minWidth: 100,
    maxWidth: 200,
    padding: 8,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.ink3,
  },
  tableCellText: {
    fontSize: 12,
    color: colors.ink,
    lineHeight: 16,
  },
  tableHeaderText: {
    fontWeight: '700',
    color: colors.ink,
  },

  // Image
  imageContainer: {
    marginVertical: 12,
    marginHorizontal: 8,
    alignItems: 'center',
    gap: 6,
  },
  imageThumbnail: {
    width: SCREEN_W - 80,
    height: 200,
    borderRadius: 8,
    backgroundColor: colors.paperDark,
  },
  imageAlt: {
    fontSize: 11,
    color: colors.ink2,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  imageHint: {
    fontSize: 10,
    color: colors.ink3,
  },
  zoomBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomImage: {
    width: SCREEN_W,
    height: SCREEN_H,
  },
});
