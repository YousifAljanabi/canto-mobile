import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LibraryScreen from '../screens/LibraryScreen';
import ReaderScreen from '../screens/ReaderScreen';
import { colors } from '../theme';

export type RootStackParamList = {
  Library: undefined;
  Reader: { filePath: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.paper },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="Library" component={LibraryScreen} />
        <Stack.Screen name="Reader" component={ReaderScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
