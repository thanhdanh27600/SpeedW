// App.tsx
import Geolocation from '@react-native-community/geolocation';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  Dimensions,
  Image,
  Linking,
  PermissionsAndroid,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Sound from 'react-native-sound';

const SPEED_LIMITS = [20, 40, 50, 60, 70, 80, 90, 100, 120];
const {width, height} = Dimensions.get('window');
const TILE_SIZE = (width - 60) / 3; // 3 tiles per row with 20px padding on sides
const CALIBRATION = 1; // + 1km/h for last result, not be proven yet but I tested it, feel real tbh
const INITIAL_SPEED = SPEED_LIMITS[3]; //60

// Define interfaces for our component's state and props
interface SpeedData {
  currentSpeed: number;
  accuracy: number;
  timestamp: number;
}

interface KalmanFilterState {
  R: number; // Measurement noise
  Q: number; // Process noise
  P: number; // Estimation error
  X: number; // Current estimate
  K: number; // Kalman gain
}

type FilterFunction = (measurement: number) => number;

// Create Kalman filter factory with proper typing
const createKalmanFilter = (): FilterFunction => {
  const state: KalmanFilterState = {
    R: 0.1,
    Q: 0.1,
    P: 1,
    X: 0,
    K: 0,
  };

  return (measurement: number): number => {
    // Prediction phase
    state.P = state.P + state.Q;

    // Update phase
    state.K = state.P / (state.P + state.R);
    state.X = state.X + state.K * (measurement - state.X);
    state.P = (1 - state.K) * state.P;

    return state.X;
  };
};

// Convert speed from m/s to km/h with proper typing
const convertToKmh = (speedInMs: number): number => {
  return Math.max(0, speedInMs * 3.6);
};

export default function App() {
  const [debug, setDebug] = useState('');
  const [showDebug, setShowDebug] = useState(__DEV__);
  const [speedLimit, setSpeedLimit] = useState(INITIAL_SPEED);
  const speedLimitRef = useRef(INITIAL_SPEED);
  const [permissionsGranted, setPermissionsGranted] = useState<boolean>(false);
  const soundRef = useRef<Sound | null>(null);
  const watchId = useRef<number | null>(null);
  const lastSpeedWarning = useRef(0);

  const [speedData, setSpeedData] = useState<SpeedData>({
    currentSpeed: 0,
    accuracy: 0,
    timestamp: Date.now(),
  });

  // Initialize location tracking with maximum precision
  const startLocationTracking = async (): Promise<void> => {
    try {
      const kalmanFilter = createKalmanFilter();

      // Watch location with specific configuration
      watchId.current = Geolocation.watchPosition(
        location => {
          const rawSpeed = location.coords.speed ?? 0;
          const speedInKmh = convertToKmh(rawSpeed);
          const filteredSpeed = kalmanFilter(speedInKmh) + CALIBRATION;
          const currentSpeed = parseFloat(filteredSpeed.toFixed(1));

          setSpeedData({
            currentSpeed,
            accuracy: location.coords.accuracy ?? 0,
            timestamp: location.timestamp,
          });

          const debug = {
            ...location.coords,
            rawSpeed: speedInKmh,
            filteredSpeed,
            locationAccuracy: location.coords.accuracy,
            timestamp: new Date(location.timestamp).toISOString(),
          };
          setDebug(JSON.stringify(debug, null, 2).replace(/\{|\}|\,|\"/gi, ''));

          if (currentSpeed >= speedLimitRef.current) {
            const now = Date.now();
            // Only play warning every 5 seconds
            if (now - lastSpeedWarning.current > 5000) {
              playWarningSound();
              lastSpeedWarning.current = now;
            }
          }
        },
        error => {
          console.log('Location error:', error);
          Alert.alert(
            'Error',
            'Failed to get location updates, check your location permission.',
            [
              {
                text: 'Open Settings',
                onPress: () => {
                  return Linking.openSettings();
                },
              },
            ],
          );
        },
        {
          enableHighAccuracy: true, // Of course
          distanceFilter: 1, // Minimum distance (meters) before getting updates
          interval: 1000, // Minimum time (ms) between updates
          fastestInterval: 500, // Fastest rate at which your app can handle updates
        },
      );
    } catch (err) {
      Alert.alert(
        'Request location error occurred',
        err instanceof Error ? err.message : '',
        [
          {
            text: 'Open Settings',
            onPress: () => {
              return Linking.openSettings();
            },
          },
        ],
      );
    }
  };

  useEffect(() => {
    setupPermissions();
    loadWarningSound();
    return () => {
      cleanupResources();
    };
  }, []);

  const setupPermissions = async () => {
    try {
      const locationPermission = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location Permission',
          message: 'App needs access to your location to measure speed.',
          buttonPositive: 'Of course dude',
        },
      );
      if (locationPermission === PermissionsAndroid.RESULTS.GRANTED) {
        setPermissionsGranted(true);
      } else {
        Alert.alert(
          'Permission Required',
          'Location permission is needed to track speed.',
          [
            {
              text: 'Open Settings',
              onPress: () => {
                return Linking.openSettings();
              },
            },
          ],
        );
      }
    } catch (error) {
      console.error('Error setting up permissions:', error);
      Alert.alert('Error', 'Failed to set up required permissions', [
        {
          text: 'Open Settings',
          onPress: () => {
            return Linking.openSettings();
          },
        },
      ]);
    }
  };

  const loadWarningSound = async () => {
    try {
      Sound.setCategory('Playback');
      soundRef.current = new Sound(
        require('./assets/sounds/warning.mp3'),
        Sound.MAIN_BUNDLE,
        error => {
          if (error) {
            console.log('Failed to load sound', error);
          }
        },
      );
    } catch (error) {
      console.error('Error loading sound:', error);
    }
  };

  const playWarningSound = async () => {
    if (soundRef.current) {
      soundRef.current.play(success => {
        if (!success) {
          Alert.alert('Sound playback failed');
        }
      });
    }
  };

  const cleanupResources = async () => {
    if (watchId.current !== null) {
      Geolocation.clearWatch(watchId.current);
    }
    if (soundRef.current) {
      soundRef.current.release();
    }
  };

  const getSpeedColor = () => {
    if (speedData.currentSpeed > speedLimit + 4) return '#e74c3c'; // Red for over limit, in Vietnam you sucks when exceed limit+5km/h
    if (speedData.currentSpeed > speedLimit) return '#e7a23c'; // Orange for pass limit
    if (speedData.currentSpeed > speedLimit - 10) return '#f1c40f'; // Yellow for approaching limit
    return '#2ecc71'; // Green for safe speed
  };

  const displaySpeed = useMemo(() => {
    let result = speedData.currentSpeed;
    if (result < 2) result = 0; // sometime it measure wrong stationary state
    return result.toFixed(1);
  }, [speedData.currentSpeed]);

  useEffect(() => {
    if (!permissionsGranted) return;
    startLocationTracking();
  }, [permissionsGranted]);

  return (
    <View style={styles.container}>
      {!permissionsGranted && (
        <Text style={styles.warningText}>
          Please grant location permissions to use this app
        </Text>
      )}
      {showDebug && (
        <Text style={{position: 'absolute', fontSize: 10, top: 0, left: 8}}>
          {debug}
        </Text>
      )}
      {!showDebug && (
        <Text>
          <Text style={{position: 'absolute', fontSize: 10, top: 0}}>
            Last updated: {new Date(speedData.timestamp).toLocaleTimeString()}
          </Text>
        </Text>
      )}
      <View style={styles.speedContainer}>
        {speedData.currentSpeed > speedLimit && (
          <Image
            style={{
              position: 'absolute',
              top: 0,
              left: 100,
              width: 150,
              height: 150,
            }}
            source={require('./assets/img/csgt.png')}
          />
        )}
        <Text style={[styles.speedValue, {color: getSpeedColor()}]}>
          {displaySpeed}
        </Text>
        <Text style={styles.speedUnit}>km/h</Text>
      </View>

      <View style={styles.limitContainer}>
        <Text style={styles.limitText}>
          Speed Limit: {speedLimit === Infinity ? '--' : speedLimit} km/h
        </Text>
      </View>

      <View style={styles.tilesContainer}>
        <ScrollView contentContainerStyle={styles.tilesScrollview}>
          {SPEED_LIMITS.map(limit => (
            <TouchableOpacity
              key={limit}
              style={[styles.tile, speedLimit === limit && styles.selectedTile]}
              onPress={() => {
                setSpeedLimit(limit);
                speedLimitRef.current = limit;
              }}>
              <Text
                style={[
                  styles.tileText,
                  speedLimit === limit && styles.selectedTileText,
                ]}>
                {limit}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[
              styles.tile,
              {width: '100%', marginBottom: 16},
              speedLimit === Infinity && styles.selectedTile,
            ]}
            onPress={() => {
              setSpeedLimit(Infinity);
              speedLimitRef.current = Infinity;
              cleanupResources().then(() => {
                loadWarningSound();
              });
            }}>
            <Text
              style={[
                styles.tileText,
                speedLimit === Infinity && styles.selectedTileText,
              ]}>
              {'OFF'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tile,
              {width: (width - 60) / 2, height: 60, marginTop: 12},
            ]}
            onPress={() => {
              playWarningSound();
            }}>
            <Text style={[styles.tileText]}>{'Test Sound'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tile,
              {width: (width - 60) / 2, height: 60, marginTop: 12},
            ]}
            onPress={() => {
              setShowDebug(_ => !_);
            }}>
            <Text style={[styles.tileText]}>{'Toggle Debug'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    paddingTop: 40,
  },
  speedContainer: {
    alignItems: 'center',
    marginBottom: 10,
    paddingTop: 10,
    position: 'relative',
  },
  speedValue: {
    fontSize: 100,
    fontWeight: 'bold',
  },
  speedUnit: {
    fontSize: 24,
    color: '#7f8c8d',
  },
  limitContainer: {
    alignItems: 'center',
    marginBottom: 2,
  },
  limitText: {
    fontSize: 24,
    color: '#34495e',
  },
  tilesContainer: {
    width: '100%',
    height: height - 300,
    marginTop: 20,
    paddingBottom: 40,
  },
  tilesScrollview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE / 1.5,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.2,
    shadowRadius: 2,
    margin: 2,
  },
  selectedTile: {
    backgroundColor: '#3498db',
    elevation: 4,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  tileText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#2c3e50',
  },
  selectedTileText: {
    color: '#ffffff',
  },
  warningText: {
    color: '#e74c3c',
    marginTop: 20,
    textAlign: 'center',
  },
});
