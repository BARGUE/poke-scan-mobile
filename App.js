import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ScannerScreen from './src/screens/ScannerScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import CollectionScreen from './src/screens/CollectionScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { ThemeProvider, useTheme } from './src/ThemeContext';

const Tab = createBottomTabNavigator();

function AppInner() {
  const { colors, isDark } = useTheme();
  return (
    <NavigationContainer>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textTertiary,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            borderTopWidth: 0.5,
            paddingBottom: 15,
            paddingTop: 8,
            height: 72,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
          tabBarIcon: ({ focused, color, size }) => {
            const icons = {
              Scanner: focused ? 'scan' : 'scan-outline',
              Historique: focused ? 'time' : 'time-outline',
              Collection: focused ? 'albums' : 'albums-outline',
              Réglages: focused ? 'settings' : 'settings-outline',
            };
            return <Ionicons name={icons[route.name]} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Scanner" component={ScannerScreen} />
        <Tab.Screen name="Historique" component={HistoryScreen} />
        <Tab.Screen name="Collection" component={CollectionScreen} />
        <Tab.Screen name="Réglages" component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppInner />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
