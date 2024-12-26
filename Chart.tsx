import React, {useEffect, useRef, useState} from 'react';
import {Dimensions, StyleSheet, View} from 'react-native';

import {LineChart} from 'react-native-chart-kit';

const {width, height} = Dimensions.get('window');

interface DataPoint {
  time: number;
  speed: number;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: 'white',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#1f2937',
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  currentSpeed: {
    fontSize: 16,
    color: '#2563eb',
    textAlign: 'center',
    marginTop: 16,
    fontWeight: '500',
  },
});

export const SpeedTimeChart = ({speed}: {speed: number}) => {
  const [data, setData] = useState<DataPoint[]>([{speed: 0, time: 0}]);
  const speedRef = useRef(speed);
  const startTime = Date.now();

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  // Prepare data for chart-kit format
  const chartData = {
    labels: data.map(d => ''),
    datasets: [
      {
        data: data.map(d => d.speed),
        color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`, // Blue color
        strokeWidth: 1,
      },
    ],
  };

  const chartConfig = {
    backgroundColor: '#ffffff',
    backgroundGradientFrom: '#ffffff',
    backgroundGradientTo: '#ffffff',
    decimalPlaces: 1,
    color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
    withDots: false,
    fromZero: true,
    // propsForDots: {
    //   r: 0,
    //   strokeWidth: 0,
    //   stroke: '#2563eb',
    // },
    // Turn off grid lines
    propsForBackgroundLines: {
      strokeWidth: 0, // This removes the grid
    },
    // Remove background lines
    withHorizontalLines: false,
    withVerticalLines: false,
    // Make background transparent
    fillShadowGradientFrom: 'transparent',
    fillShadowGradientTo: 'transparent',
  };

  // Simulate real-time speed data
  useEffect(() => {
    const interval = setInterval(() => {
      const currentTime = Date.now();
      const timeElapsed = (currentTime - startTime) / 1000; // Convert to seconds

      const newSpeed = speedRef.current;

      setData(prevData => {
        // Keep last 20 data points for better visualization
        const newData = [...prevData, {time: timeElapsed, speed: newSpeed}];
        if (newData.length > 20) {
          return newData.slice(-20);
        }
        return newData;
      });
    }, 1000); // Update every 2 second

    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.container}>
      <LineChart
        data={chartData}
        width={width - 4} // Account for padding
        height={256}
        chartConfig={chartConfig}
        bezier
        style={styles.chart}
        // yAxisLabel="km/s "
        yAxisSuffix=""
        // xAxisLabel="s"
        verticalLabelRotation={30}
      />
    </View>
  );
};
