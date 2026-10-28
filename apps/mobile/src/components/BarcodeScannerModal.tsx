import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Alert,
  Dimensions,
} from "react-native";
import { CameraView, useCameraPermissions, BarcodeScanningResult } from "expo-camera";
import { findProductByBarcode } from "../db";
import { Product } from "../api";

interface Props {
  visible: boolean;
  onClose: () => void;
  onProductFound: (product: Product) => void;
}

const { width } = Dimensions.get("window");
const SCAN_BOX_SIZE = width * 0.7;

export default function BarcodeScannerModal({ visible, onClose, onProductFound }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [torch, setTorch] = useState(false);

  useEffect(() => {
    if (visible) {
      setScanned(false);
      if (!permission?.granted) {
        requestPermission();
      }
    }
  }, [visible, permission?.granted]);

  const handleBarcodeScanned = async ({ data }: BarcodeScanningResult) => {
    if (scanned) return;
    setScanned(true);

    const barcodeVal = data ? data.trim() : "";
    if (!barcodeVal) {
      setScanned(false);
      return;
    }

    // ૧. લોકલ SQLite કેશમાંથી સુપરફાસ્ટ પ્રોડક્ટ શોધો
    const product = await findProductByBarcode(barcodeVal);

    if (product) {
      onProductFound(product);
      onClose();
    } else {
      Alert.alert(
        "પ્રોડક્ટ મળી નથી",
        `બારકોડ: ${barcodeVal}\nઆ બારકોડ સાથે કોઈપણ પ્રોડક્ટ લિંક થયેલી નથી.`,
        [
          { text: "ફરી સ્કેન કરો", onPress: () => setScanned(false) },
          { text: "બંધ કરો", onPress: onClose, style: "cancel" },
        ]
      );
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        {!permission ? (
          <View style={styles.centerBox}>
            <Text style={styles.infoText}>કેમેરા પરવાનગી ચકાસી રહ્યા છીએ...</Text>
          </View>
        ) : !permission.granted ? (
          <View style={styles.centerBox}>
            <Text style={styles.errorText}>❌ કેમેરા પરવાનગી નકારી દેવામાં આવી છે.</Text>
            <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
              <Text style={styles.permBtnText}>પરવાનગી આપો (Allow Camera)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>પાછા જાઓ</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <CameraView
            style={styles.cameraView}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{
              barcodeTypes: [
                "qr",
                "ean13",
                "ean8",
                "upc_a",
                "upc_e",
                "code128",
                "code39",
                "code93",
                "itf14",
              ],
            }}
            onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
          >
            {/* Top Bar */}
            <View style={styles.topBar}>
              <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
                <Text style={styles.iconBtnText}>✕ બંધ કરો</Text>
              </TouchableOpacity>
              <Text style={styles.topTitle}>બારકોડ સ્કેનર</Text>
              <TouchableOpacity onPress={() => setTorch(!torch)} style={styles.iconBtn}>
                <Text style={styles.iconBtnText}>{torch ? "⚡ ફ્લેશ On" : "💡 ફ્લેશ Off"}</Text>
              </TouchableOpacity>
            </View>

            {/* Viewfinder Target Overlay */}
            <View style={styles.overlay}>
              <View style={styles.scanTarget}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
                <View style={styles.laserLine} />
              </View>
              <Text style={styles.guideText}>
                પ્રોડક્ટનો બારકોડ અથવા QR કોડ આ બોક્સની અંદર રાખો
              </Text>
            </View>
          </CameraView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  cameraView: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  centerBox: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  infoText: { color: "#fff", fontSize: 16 },
  errorText: { color: "#EF4444", fontSize: 16, fontWeight: "bold", textAlign: "center", marginBottom: 20 },
  permBtn: { backgroundColor: "#047857", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, marginBottom: 12 },
  permBtnText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  closeBtn: { backgroundColor: "#334155", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  closeBtnText: { color: "#fff", fontWeight: "bold" },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 50,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  topTitle: { color: "#fff", fontSize: 17, fontWeight: "800" },
  iconBtn: { backgroundColor: "rgba(0,0,0,0.6)", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  iconBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scanTarget: {
    width: SCAN_BOX_SIZE,
    height: SCAN_BOX_SIZE * 0.7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 24,
    height: 24,
    borderColor: "#10B981",
  },
  cornerTL: { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 10 },
  cornerTR: { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 10 },
  cornerBL: { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 10 },
  cornerBR: { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 10 },
  laserLine: {
    width: "90%",
    height: 2,
    backgroundColor: "#EF4444",
    shadowColor: "#EF4444",
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
  guideText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 24,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
});