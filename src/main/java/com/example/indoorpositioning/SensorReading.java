package com.example.indoorpositioning;

/**
 * Minimal sensor-read interface for the indoor positioning pipeline.
 */
public interface SensorReading {
    double getAccelerometerX();

    double getAccelerometerY();

    double getAccelerometerZ();

    double getGyroscopeX();

    double getGyroscopeY();

    double getGyroscopeZ();

    double getTimestampSeconds();
}
