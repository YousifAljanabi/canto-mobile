import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
  Image,
  RefreshControl,
  ActivityIndicator,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme';
import { parseEpub } from '../services/epubParser';
import { getLibrary, addToLibrary, removeFromLibrary, LibraryEntry } from '../services/storage';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Library'>;

function BookCard({ entry, onPress, onLongPress }: { entry: LibraryEntry; onPress: () => void; onLongPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.8}>
      <View style={styles.coverContainer}>
        {entry.coverBase64 ? (
          <Image
            source={{ uri: `data:image/jpeg;base64,${entry.coverBase64}` }}
            style={styles.cover}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.cover, styles.coverPlaceholder]}>
            <Text style={styles.coverPlaceholderText} numberOfLines={3}>{entry.title}</Text>
          </View>
        )}
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>{entry.title}</Text>
      <Text style={styles.cardAuthor} numberOfLines={1}>{entry.author}</Text>
      <Text style={styles.cardMeta}>{entry.totalChapters} ch</Text>
    </TouchableOpacity>
  );
}

export default function LibraryScreen() {
  const navigation = useNavigation<Nav>();
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function loadLibrary() {
    const lib = await getLibrary();
    setLibrary(lib);
  }

  useFocusEffect(useCallback(() => {
    loadLibrary();
  }, []));

  async function onRefresh() {
    setRefreshing(true);
    await loadLibrary();
    setRefreshing(false);
  }

  async function pickEpub() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/epub+zip', 'application/epub', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      if (!asset.name.toLowerCase().endsWith('.epub') && !asset.mimeType?.includes('epub')) {
        Alert.alert('Not an EPUB', 'Please select a .epub file.');
        return;
      }

      setLoading(true);
      try {
        const book = await parseEpub(asset.uri);
        const entry: LibraryEntry = {
          filePath: asset.uri,
          title: book.metadata.title,
          author: book.metadata.author,
          coverBase64: book.metadata.coverImageBase64,
          lastOpened: Date.now(),
          totalChapters: book.chapters.length,
        };
        await addToLibrary(entry);
        await loadLibrary();
        navigation.navigate('Reader', { filePath: asset.uri });
      } catch (err) {
        Alert.alert('Parse Error', `Could not read epub: ${String(err)}`);
      } finally {
        setLoading(false);
      }
    } catch (err) {
      Alert.alert('Error', String(err));
    }
  }

  function openBook(entry: LibraryEntry) {
    navigation.navigate('Reader', { filePath: entry.filePath });
  }

  function confirmRemove(entry: LibraryEntry) {
    Alert.alert(
      'Remove book',
      `Remove "${entry.title}" from library?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeFromLibrary(entry.filePath);
            await loadLibrary();
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.logo}>canto.</Text>
        <TouchableOpacity style={styles.addBtn} onPress={pickEpub} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : (
            <Text style={styles.addBtnText}>+ Open EPUB</Text>
          )}
        </TouchableOpacity>
      </View>

      {library.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📚</Text>
          <Text style={styles.emptyTitle}>Your library is empty</Text>
          <Text style={styles.emptyHint}>Tap "Open EPUB" to add your first book</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={pickEpub} disabled={loading}>
            <Text style={styles.emptyBtnText}>Open EPUB file</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={styles.sectionLabel}>Library</Text>
          <FlatList
            data={library}
            keyExtractor={item => item.filePath}
            numColumns={2}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <BookCard
                entry={item}
                onPress={() => openBook(item)}
                onLongPress={() => confirmRemove(item)}
              />
            )}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
            }
          />
        </>
      )}
    </SafeAreaView>
  );
}

const CARD_W = '47%';

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  logo: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: colors.ink,
  },
  addBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 100,
    alignItems: 'center',
  },
  addBtnText: {
    color: colors.paper,
    fontWeight: '600',
    fontSize: 14,
  },
  sectionLabel: {
    fontSize: 12,
    color: colors.ink2,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  card: {
    width: CARD_W,
    gap: 6,
  },
  coverContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.paperDark,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cover: {
    width: '100%',
    aspectRatio: 0.67,
  },
  coverPlaceholder: {
    backgroundColor: colors.paperDark,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  coverPlaceholderText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink2,
    textAlign: 'center',
    lineHeight: 18,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
    lineHeight: 18,
  },
  cardAuthor: {
    fontSize: 11,
    color: colors.ink2,
  },
  cardMeta: {
    fontSize: 10,
    color: colors.ink3,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 12,
  },
  emptyIcon: {
    fontSize: 52,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 14,
    color: colors.ink2,
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyBtn: {
    marginTop: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 28,
  },
  emptyBtnText: {
    color: colors.paper,
    fontSize: 16,
    fontWeight: '600',
  },
});
