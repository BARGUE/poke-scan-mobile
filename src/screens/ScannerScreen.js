import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Image, Dimensions, Animated, Easing,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { identifyCard } from '../services/anthropic';
import { fetchCardPrices } from '../services/prices';
import { saveToHistory } from '../services/storage';
import { FONTS, RADIUS, SHADOWS, BRAND } from '../theme';
import { useTheme } from '../ThemeContext';
import CardResultView from '../components/CardResultView';

const { width, height: screenH } = Dimensions.get('window');

const LOAD_STEPS = [
  { icon: 'scan-outline', label: 'Analyse de la carte par IA…' },
  { icon: 'library-outline', label: 'Identification du set et numéro…' },
  { icon: 'globe-outline', label: 'Recherche des prix en ligne…' },
  { icon: 'bar-chart-outline', label: 'Calcul du meilleur prix…' },
];

function FloatingPokeball({ size = 120, style, bob = 12, spinDuration = 14000 }) {
  const bobAnim = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bobAnim, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bobAnim, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    const spinLoop = Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: spinDuration, easing: Easing.linear, useNativeDriver: true })
    );
    bobLoop.start();
    spinLoop.start();
    return () => { bobLoop.stop(); spinLoop.stop(); };
  }, [bobAnim, spinAnim, spinDuration]);

  const translateY = bobAnim.interpolate({ inputRange: [0, 1], outputRange: [-bob, bob] });
  const rotate = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const half = size / 2;
  const bandH = Math.max(4, size * 0.1);
  const btn = size * 0.3;
  const btnInner = size * 0.16;
  const dark = '#0B0B10';
  const light = '#EDEDF2';

  return (
    <Animated.View style={[{ width: size, height: size, transform: [{ translateY }, { rotate }] }, style]}>
      <View style={{ width: size, height: size, borderRadius: half, overflow: 'hidden', borderWidth: Math.max(2, size * 0.03), borderColor: dark }}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: half, backgroundColor: BRAND }} />
        <View style={{ position: 'absolute', top: half + bandH / 2 - 1, left: 0, right: 0, bottom: 0, backgroundColor: light }} />
        <View style={{ position: 'absolute', top: half - bandH / 2, left: 0, right: 0, height: bandH, backgroundColor: dark }} />
        <View style={{ position: 'absolute', top: half - btn / 2, left: half - btn / 2, width: btn, height: btn, borderRadius: btn / 2, backgroundColor: dark, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: btnInner, height: btnInner, borderRadius: btnInner / 2, backgroundColor: light }} />
        </View>
      </View>
    </Animated.View>
  );
}

export default function ScannerScreen() {
  const insets = useSafeAreaInsets();
  const { colors, currency } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isFocused = useIsFocused();
  const cameraRef = useRef(null);
  const frameRef = useRef(null);
  const cancelledRef = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState('back');
  const [phase, setPhase] = useState('idle'); // idle | scanning | result | error
  const [loadStep, setLoadStep] = useState(0);
  const [capturedUri, setCapturedUri] = useState(null);
  const [cardInfo, setCardInfo] = useState(null);
  const [prices, setPrices] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const runLoadingSteps = useCallback(() => {
    let step = 0;
    const interval = setInterval(() => {
      step++;
      setLoadStep(step);
      if (step >= LOAD_STEPS.length - 1) clearInterval(interval);
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  const analyze = useCallback(async (uri, base64) => {
    cancelledRef.current = false;
    setPhase('scanning');
    setLoadStep(0);
    setCapturedUri(uri);
    const stopSteps = runLoadingSteps();

    try {
      const card = await identifyCard(base64);
      if (cancelledRef.current) { stopSteps(); return; }
      if (!card.found) {
        stopSteps();
        setErrorMsg(card.reason || 'Aucune carte Pokémon détectée.');
        setPhase('error');
        return;
      }
      setCardInfo(card);
      const priceData = await fetchCardPrices(card, currency);
      if (cancelledRef.current) { stopSteps(); return; }
      setPrices(priceData);
      await saveToHistory(card, priceData, uri);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      stopSteps();
      setPhase('result');
    } catch (err) {
      stopSteps();
      if (cancelledRef.current) return;
      setErrorMsg(err.message || 'Une erreur est survenue.');
      setPhase('error');
    }
  }, [runLoadingSteps, currency]);

  // Mesure la position du cadre de visée dans la fenêtre (coordonnées écran).
  const measureFrame = useCallback(() => new Promise((resolve) => {
    if (!frameRef.current) return resolve(null);
    frameRef.current.measureInWindow((x, y, w, h) => resolve({ x, y, w, h }));
  }), []);

  // Recadre la photo capturée sur la zone du cadre affiché à l'écran.
  // L'aperçu caméra est en mode "cover" : il remplit la fenêtre (hauteur = écran
  // moins la barre du bas) en rognant le débord. On reproduit ce mapping pour
  // retrouver, en pixels de la photo, le rectangle qui correspond au cadre.
  const cropToFrame = useCallback(async (photo) => {
    try {
      const frame = await measureFrame();
      if (!frame || !photo.width || !photo.height) return photo;

      const camW = width;
      const camH = screenH - insets.bottom; // zone réellement occupée par la caméra
      const { width: pw, height: ph } = photo;

      const s = Math.max(camW / pw, camH / ph); // échelle "cover"
      const originX = ((frame.x) + (pw * s - camW) / 2) / s;
      const originY = ((frame.y) + (ph * s - camH) / 2) / s;
      const cropW = frame.w / s;
      const cropH = frame.h / s;

      const crop = {
        originX: Math.max(0, Math.min(originX, pw - 1)),
        originY: Math.max(0, Math.min(originY, ph - 1)),
        width: Math.max(1, Math.min(cropW, pw)),
        height: Math.max(1, Math.min(cropH, ph)),
      };

      const result = await manipulateAsync(
        photo.uri,
        [{ crop }],
        { base64: true, compress: 0.8, format: SaveFormat.JPEG },
      );
      return result;
    } catch (e) {
      console.warn('Recadrage impossible, photo entière utilisée', e);
      return photo; // en cas d'échec, on garde la photo complète
    }
  }, [measureFrame, insets.bottom]);

  const capturePhoto = useCallback(async () => {
    if (!cameraRef.current) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.8 });
    const cropped = await cropToFrame(photo);
    await analyze(cropped.uri, cropped.base64);
  }, [analyze, cropToFrame]);

  const pickFromGallery = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true, quality: 0.8,
    });
    if (!res.canceled && res.assets[0]) {
      await analyze(res.assets[0].uri, res.assets[0].base64);
    }
  }, [analyze]);

  const startCamera = useCallback(async () => {
    let granted = permission?.granted;
    if (!granted) {
      const res = await requestPermission();
      granted = res?.granted;
    }
    if (!granted) {
      Alert.alert(
        'Accès caméra requis',
        "Autorise l'accès à la caméra dans les réglages, ou importe une photo depuis ta galerie.",
      );
      return;
    }
    setPhase('camera');
  }, [permission, requestPermission]);

  const reset = () => {
    cancelledRef.current = true;
    setPhase('idle');
    setCardInfo(null);
    setPrices(null);
    setCapturedUri(null);
    setLoadStep(0);
  };

  if (!permission) return <View style={styles.centered}><ActivityIndicator /></View>;

  if (phase === 'scanning') {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        {capturedUri && (
          <Image source={{ uri: capturedUri }} style={styles.capturedPreview} />
        )}
        <View style={styles.loadingCard}>
          <FloatingPokeball size={56} bob={6} spinDuration={1600} />
          <Text style={styles.loadingTitle}>Analyse en cours…</Text>
          {LOAD_STEPS.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <Ionicons
                name={i < loadStep ? 'checkmark-circle' : i === loadStep ? step.icon : 'ellipse-outline'}
                size={16}
                color={i < loadStep ? colors.success : i === loadStep ? colors.primary : colors.textTertiary}
              />
              <Text style={[
                styles.stepText,
                i === loadStep && { color: colors.primary, fontWeight: '500' },
                i < loadStep && { color: colors.success },
              ]}>
                {step.label}
              </Text>
            </View>
          ))}
        </View>
        <TouchableOpacity style={[styles.btnSecondary, { marginTop: 20 }]} onPress={reset}>
          <Ionicons name="close" size={18} color={colors.textPrimary} />
          <Text style={styles.btnSecondaryText}>Annuler</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle" size={40} color={colors.primary} />
          <Text style={styles.errorTitle}>Carte non reconnue</Text>
          <Text style={styles.errorMsg}>{errorMsg}</Text>
          <TouchableOpacity style={styles.btnPrimary} onPress={reset}>
            <Ionicons name="scan-outline" size={18} color="#fff" />
            <Text style={styles.btnPrimaryText}>Réessayer</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnSecondary, { marginTop: 10 }]} onPress={pickFromGallery}>
            <Ionicons name="image-outline" size={18} color={colors.textPrimary} />
            <Text style={styles.btnSecondaryText}>Choisir une photo</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (phase === 'result' && cardInfo && prices) {
    return (
      <CardResultView
        card={cardInfo}
        prices={prices}
        imageUri={capturedUri}
        onClose={reset}
        footerLabel="Scanner une autre carte"
        footerIcon="scan-outline"
        onFooterPress={reset}
      />
    );
  }

  if (phase === 'camera') {
    return (
      <View style={[styles.cameraScreen, { paddingBottom: insets.bottom }]}>
        <CameraView ref={cameraRef} style={styles.camera} facing={facing} active={isFocused}>
          <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity style={styles.cameraBackBtn} onPress={reset}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.cameraTitle}>🃏 Pokémon Scanner</Text>
            <TouchableOpacity
              style={styles.flipBtn}
              onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
            >
              <Ionicons name="camera-reverse-outline" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.frameContainer}>
            <View ref={frameRef} style={styles.scanFrame} collapsable={false}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
            <Text style={styles.frameHint}>Centrez la carte dans le cadre</Text>
          </View>

          <View style={styles.bottomBar}>
            <TouchableOpacity style={styles.galleryBtn} onPress={pickFromGallery}>
              <Ionicons name="image-outline" size={26} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.captureBtn} onPress={capturePhoto}>
              <View style={styles.captureBtnInner} />
            </TouchableOpacity>
            <View style={{ width: 52 }} />
          </View>
        </CameraView>
      </View>
    );
  }

  // phase === 'idle' : écran d'accueil avec choix
  return (
    <View style={[styles.homeScreen, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
      <FloatingPokeball size={300} bob={20} spinDuration={26000} style={styles.bgPokeballTop} />
      <FloatingPokeball size={200} bob={16} spinDuration={32000} style={styles.bgPokeballBottom} />

      <View style={styles.homeHeader}>
        <FloatingPokeball size={96} bob={10} spinDuration={11000} style={styles.heroPokeball} />
        <Text style={styles.homeTitle}>Pokémon Scanner</Text>
        <Text style={styles.homeSub}>Scanne une carte pour identifier son nom, sa rareté et estimer son prix.</Text>
      </View>

      <View style={styles.homeActions}>
        <TouchableOpacity style={styles.btnPrimary} onPress={startCamera} activeOpacity={0.85}>
          <Ionicons name="scan-outline" size={20} color="#fff" />
          <Text style={styles.btnPrimaryText}>Scanner avec la caméra</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnSecondary, { marginTop: 12 }]} onPress={pickFromGallery} activeOpacity={0.85}>
          <Ionicons name="image-outline" size={18} color={colors.textPrimary} />
          <Text style={styles.btnSecondaryText}>Importer une photo</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const FRAME_W = width * 0.72;
const FRAME_H = FRAME_W * 1.4;

const makeStyles = (COLORS) => StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg, padding: 24 },
  permissionScreen: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
  permissionEmoji: { fontSize: 64, marginBottom: 20 },
  permissionTitle: { fontSize: FONTS.size.xl, fontWeight: '500', color: COLORS.textPrimary, marginBottom: 12, textAlign: 'center' },
  permissionSub: { fontSize: FONTS.size.md, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 32 },

  homeScreen: { flex: 1, backgroundColor: COLORS.bg, paddingHorizontal: 32, justifyContent: 'space-between', overflow: 'hidden' },
  homeHeader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroPokeball: { marginBottom: 28, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 24, elevation: 12 },
  bgPokeballTop: { position: 'absolute', top: -70, right: -90, opacity: 0.06 },
  bgPokeballBottom: { position: 'absolute', bottom: 30, left: -80, opacity: 0.05 },
  homeTitle: { fontSize: FONTS.size.title, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 12, textAlign: 'center', letterSpacing: 0.3 },
  homeSub: { fontSize: FONTS.size.md, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, maxWidth: 300 },
  homeActions: { width: '100%' },

  cameraScreen: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
  cameraTitle: { fontSize: FONTS.size.lg, fontWeight: '500', color: '#fff' },
  cameraBackBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  flipBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  frameContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scanFrame: { width: FRAME_W, height: FRAME_H, position: 'relative' },
  corner: { position: 'absolute', width: 24, height: 24, borderColor: COLORS.primary, borderStyle: 'solid' },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 4 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 4 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 4 },
  frameHint: { color: 'rgba(255,255,255,0.7)', fontSize: FONTS.size.sm, marginTop: 16 },

  bottomBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 40, paddingVertical: 32 },
  galleryBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  captureBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff' },
  captureBtnInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },

  capturedPreview: { width: 160, height: 220, borderRadius: RADIUS.md, marginBottom: 24, opacity: 0.6 },
  loadingCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 24, width: '100%', alignItems: 'center', gap: 16, ...SHADOWS.md },
  loadingTitle: { fontSize: FONTS.size.lg, fontWeight: '500', color: COLORS.textPrimary },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  stepText: { fontSize: FONTS.size.sm, color: COLORS.textTertiary },

  errorCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 28, width: '100%', alignItems: 'center', gap: 12, ...SHADOWS.md },
  errorTitle: { fontSize: FONTS.size.xl, fontWeight: '500', color: COLORS.textPrimary },
  errorMsg: { fontSize: FONTS.size.md, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },

  btnPrimary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 14, paddingHorizontal: 24 },
  btnPrimaryText: { color: '#fff', fontSize: FONTS.size.md, fontWeight: '500' },
  btnSecondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, paddingVertical: 14, paddingHorizontal: 24, borderWidth: 0.5, borderColor: COLORS.border },
  btnSecondaryText: { color: COLORS.textPrimary, fontSize: FONTS.size.md },
});
