import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { canvasOffset, fitScene, SCENE_H, SCENE_W } from '../lib/scene';
import { colors } from '../theme';

/**
 * The web login scene, for the phone: a Precon lorry delivering a precast
 * sump. It drives in once, then cruises while the town, road and water slide
 * past. Plain views on the web's 400 x 160 canvas, scaled to fit; React
 * Native's Animated on the native driver (transforms and opacity only), so it
 * stays smooth and costs the JS thread nothing. No extra libraries. With
 * "Remove animations" on, it's a still picture.
 */

/** Houses with rooftop water tanks: the homes our sumps serve. [x, width, height] (same as web). */
const HOUSES: [number, number, number][] = [
  [26, 34, 22],
  [96, 26, 30],
  [176, 40, 18],
  [262, 28, 26],
  [336, 34, 20],
];

/** A shape on the 400 x 160 canvas. */
const at = (x: number, y: number, w: number, h: number, extra: ViewStyle = {}): ViewStyle => ({ position: 'absolute', left: x, top: y, width: w, height: h, ...extra });
const circle = (cx: number, cy: number, r: number, extra: ViewStyle = {}) => at(cx - r, cy - r, r * 2, r * 2, { borderRadius: r, ...extra });

/** A value looping 0 -> 1 forever (linear unless eased), started after an optional delay. */
function loop(value: Animated.Value, ms: number, opts: { easing?: (t: number) => number; reverse?: boolean; delay?: number } = {}) {
  const run = Animated.timing(value, { toValue: 1, duration: ms, easing: opts.easing ?? Easing.linear, useNativeDriver: true });
  const looped = Animated.loop(opts.reverse ? Animated.sequence([run, Animated.timing(value, { toValue: 0, duration: ms, easing: opts.easing ?? Easing.linear, useNativeDriver: true })]) : run);
  return opts.delay ? Animated.sequence([Animated.delay(opts.delay), looped]) : looped;
}

function Wheel({ cx, spin }: { cx: number; spin: Animated.AnimatedInterpolation<string> }) {
  return (
    <Animated.View style={[circle(cx, 113, 11), { transform: [{ rotate: spin }] }]}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: 11, backgroundColor: '#0b1324' }]} />
      <View style={circle(11, 11, 6.2, { backgroundColor: '#cbd5e1' })} />
      <View style={at(10.3, 5.6, 1.4, 10.8, { backgroundColor: '#64748b' })} />
      <View style={at(5.6, 10.3, 10.8, 1.4, { backgroundColor: '#64748b' })} />
      <View style={circle(11, 11, 2, { backgroundColor: '#334155' })} />
    </Animated.View>
  );
}

export function DeliveryScene() {
  const [width, setWidth] = useState(0);
  const { scale, height } = fitScene(width);
  const offset = canvasOffset(width, height);

  // One value per motion; all run on the native side.
  const v = useMemo(
    () => ({
      arrive: new Animated.Value(0),
      far: new Animated.Value(0),
      mid: new Animated.Value(0),
      wave: new Animated.Value(0),
      dash: new Animated.Value(0),
      bob: new Animated.Value(0),
      spin: new Animated.Value(0),
      beam: new Animated.Value(0),
      speed: [new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)],
    }),
    [],
  );
  const [still, setStill] = useState(false);

  useEffect(() => {
    let alive = true;
    let running: Animated.CompositeAnimation | null = null;
    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (!alive) return;
        if (reduce) {
          setStill(true);
          v.arrive.setValue(1);
          return;
        }
        running = Animated.parallel([
          Animated.timing(v.arrive, { toValue: 1, duration: 2400, easing: Easing.bezier(0.22, 0.85, 0.3, 1), useNativeDriver: true }),
          loop(v.far, 36_000),
          loop(v.mid, 16_000),
          loop(v.wave, 9_000),
          loop(v.dash, 550),
          loop(v.bob, 420, { easing: Easing.inOut(Easing.ease), reverse: true }),
          loop(v.spin, 500),
          loop(v.beam, 1400, { easing: Easing.inOut(Easing.ease), reverse: true }),
          ...v.speed.map((s, i) => loop(s, 900, { easing: Easing.out(Easing.ease), delay: i * 300 })),
        ]);
        running.start();
      });
    return () => {
      alive = false;
      running?.stop();
    };
  }, [v]);

  const scroll = (value: Animated.Value, by = SCENE_W) => ({ transform: [{ translateX: value.interpolate({ inputRange: [0, 1], outputRange: [0, -by] }) }] });
  const spin = v.spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View
      style={[styles.card, { height: height || undefined, aspectRatio: height ? undefined : SCENE_W / SCENE_H }]}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="image"
      accessibilityLabel="A Precon lorry delivering a precast concrete sump"
      testID="delivery-scene"
    >
      <LinearGradient colors={[colors.navy950, colors.ocean]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {width > 0 && (
        <View pointerEvents="none" style={[styles.canvas, { left: offset.left, top: offset.top, transform: [{ scale }] }]}>
          {/* Sky glow */}
          {/* Soft radial glow: many faint rings stacked, so no edge shows */}
          {[46, 40, 34, 28, 23, 18, 14].map((r) => (
            <View key={r} style={circle(318, 42, r, { backgroundColor: '#7dd3fc', opacity: 0.045 })} />
          ))}
          <View style={circle(318, 42, 11, { backgroundColor: '#e0f2fe', opacity: 0.5 })} />

          {/* Far hills (slow) */}
          <Animated.View style={[at(0, 0, SCENE_W * 2, SCENE_H), scroll(v.far)]}>
            {[0, SCENE_W].map((dx) => (
              <View key={dx}>
                <View style={at(dx - 20, 100, 170, 40, { borderRadius: 20, backgroundColor: '#ffffff', opacity: 0.06 })} />
                <View style={at(dx + 110, 106, 150, 30, { borderRadius: 15, backgroundColor: '#ffffff', opacity: 0.06 })} />
                <View style={at(dx + 240, 96, 180, 44, { borderRadius: 22, backgroundColor: '#ffffff', opacity: 0.06 })} />
              </View>
            ))}
          </Animated.View>

          {/* Town with rooftop tanks (medium) */}
          <Animated.View style={[at(0, 0, SCENE_W * 2, SCENE_H, { opacity: 0.1 }), scroll(v.mid)]}>
            {[0, SCENE_W].map((dx) =>
              HOUSES.map(([x, w, h]) => (
                <View key={`${dx}-${x}`}>
                  <View style={at(dx + x, 124 - h, w, h, { borderRadius: 1.5, backgroundColor: '#ffffff' })} />
                  <View style={at(dx + x + w - 11, 124 - h - 7, 8, 6, { borderRadius: 1.5, backgroundColor: '#ffffff' })} />
                </View>
              )),
            )}
          </Animated.View>

          {/* Road, with its centre line moving */}
          <View style={at(0, 124, SCENE_W, 16, { backgroundColor: '#071a33', opacity: 0.6 })} />
          <View style={at(0, 124, SCENE_W, 1, { backgroundColor: '#ffffff', opacity: 0.18 })} />
          <Animated.View style={[at(-30, 131.2, SCENE_W + 60, 1.6), scroll(v.dash, 30)]}>
            {Array.from({ length: 16 }, (_, i) => (
              <View key={i} style={at(i * 30, 0, 16, 1.6, { backgroundColor: '#ffffff', opacity: 0.45 })} />
            ))}
          </Animated.View>

          {/* Water: a band with a gentle wave along its top */}
          <Animated.View style={[at(0, 138, SCENE_W * 2, 22), scroll(v.wave)]}>
            {Array.from({ length: 16 }, (_, i) => (
              <View key={i} style={at(i * 50 - 6, i % 2 ? 2.5 : 4.5, 62, 10, { borderRadius: 5, backgroundColor: '#0ea5e9', opacity: 0.32 })} />
            ))}
            <LinearGradient colors={['#0ea5e98c', '#2557eb40']} style={at(0, 8, SCENE_W * 2, 14)} />
          </Animated.View>

          {/* The lorry: drives in once, then cruises */}
          <Animated.View style={[at(108, 0, 230, SCENE_H), { transform: [{ translateX: v.arrive.interpolate({ inputRange: [0, 1], outputRange: [still ? 0 : -330, 0] }) }] }]}>
            <View style={at(2, 122.4, 176, 5.2, { borderRadius: 88, backgroundColor: '#000000', opacity: 0.28 })} />

            {/* Speed lines */}
            {[
              [-26, 68, 18],
              [-34, 82, 24],
              [-22, 96, 16],
            ].map(([x, y, w], i) => (
              <Animated.View
                key={y}
                style={[
                  at(x, y - 0.75, w, 1.5, { borderRadius: 1, backgroundColor: '#ffffff' }),
                  {
                    opacity: v.speed[i].interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.5, 0] }),
                    transform: [{ translateX: v.speed[i].interpolate({ inputRange: [0, 1], outputRange: [0, -16] }) }],
                  },
                ]}
              />
            ))}

            <Animated.View style={[at(0, 0, 230, SCENE_H), { transform: [{ translateY: v.bob.interpolate({ inputRange: [0, 1], outputRange: [0, -1.1] }) }] }]}>
              {/* Headlight beam */}
              <Animated.View style={[at(175, 77, 43, 20), { opacity: v.beam.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] }) }]}>
                <LinearGradient colors={['#fde68a8c', '#fde68a00']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[StyleSheet.absoluteFill, { borderTopRightRadius: 10, borderBottomRightRadius: 10 }]} />
              </Animated.View>

              {/* Chassis and flatbed */}
              <View style={at(4, 100, 168, 6, { borderRadius: 2, backgroundColor: '#0b2545' })} />
              <View style={at(0, 94, 122, 7, { borderRadius: 1.5, backgroundColor: '#1e3aaf' })} />

              {/* Precast sump, strapped down */}
              <LinearGradient colors={['#f1f4f8', '#b9c2ce']} style={at(10, 56, 100, 38, { borderRadius: 2 })} />
              <View style={at(6, 50, 108, 7, { borderRadius: 1.5, backgroundColor: '#d6dce4' })} />
              <View style={at(48, 44, 24, 6.5, { borderRadius: 1.5, backgroundColor: '#a5aebb' })} />
              <View style={at(56, 41.5, 8, 2.6, { borderRadius: 1, backgroundColor: '#8892a2' })} />
              <View style={at(42.6, 57.5, 0.8, 36, { backgroundColor: '#a9b2bf' })} />
              <View style={at(76.6, 57.5, 0.8, 36, { backgroundColor: '#a9b2bf' })} />
              <View style={at(23, 50, 2, 44, { backgroundColor: '#0f4c81', opacity: 0.85 })} />
              <View style={at(95, 50, 2, 44, { backgroundColor: '#0f4c81', opacity: 0.85 })} />
              {/* Water drop */}
              <View style={at(57.6, 67.4, 4.8, 4.8, { backgroundColor: '#0ea5e9', transform: [{ rotate: '45deg' }], borderTopLeftRadius: 0.5 })} />
              <View style={circle(60, 72.8, 3.4, { backgroundColor: '#0ea5e9' })} />
              <Text style={[at(10, 79.5, 100, 9), styles.mark]} allowFontScaling={false}>
                PRECON
              </Text>

              {/* Cab */}
              <View style={at(119, 52, 3, 42, { borderRadius: 1, backgroundColor: '#94a3b8' })} />
              <View style={at(124, 58, 50, 42, { backgroundColor: colors.blue, borderTopLeftRadius: 8, borderTopRightRadius: 16, borderBottomRightRadius: 2 })} />
              <View style={at(146, 64, 21, 15, { backgroundColor: '#d6ecff', opacity: 0.95, borderTopRightRadius: 8, borderTopLeftRadius: 2 })} />
              <View style={at(144, 63, 1, 36, { backgroundColor: '#1d45d8' })} />
              <View style={at(137, 80, 5, 1.6, { borderRadius: 0.8, backgroundColor: '#bfd5fe' })} />
              <View style={at(124, 88, 50, 3, { backgroundColor: '#0ea5e9' })} />
              <View style={at(170, 94, 7, 7, { borderRadius: 1.5, backgroundColor: '#cbd5e1' })} />
              <View style={at(171, 83, 4, 5, { borderRadius: 1, backgroundColor: '#fde68a' })} />
            </Animated.View>

            <Wheel cx={32} spin={spin} />
            <Wheel cx={62} spin={spin} />
            <Wheel cx={152} spin={spin} />
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', borderRadius: 20, overflow: 'hidden', backgroundColor: colors.navy950 },
  canvas: { position: 'absolute', width: SCENE_W, height: SCENE_H },
  mark: { textAlign: 'center', fontSize: 6.6, lineHeight: 8, fontWeight: '700', letterSpacing: 2.2, color: '#5b6778' },
});
