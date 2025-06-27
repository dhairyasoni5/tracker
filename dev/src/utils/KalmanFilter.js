// src/utils/KalmanFilter.js
class KalmanFilter {
  constructor() {
    // State vector [x, y, vx, vy]
    this.state = [0, 0, 0, 0];
    
    // State covariance matrix (4x4)
    this.P = [
      [1000, 0, 0, 0],
      [0, 1000, 0, 0],
      [0, 0, 1000, 0],
      [0, 0, 0, 1000]
    ];
    
    // Process noise covariance
    this.Q = [
      [0.1, 0, 0, 0],
      [0, 0.1, 0, 0],
      [0, 0, 0.1, 0],
      [0, 0, 0, 0.1]
    ];
    
    // Measurement noise covariance (2x2 for x,y measurements)
    this.R = [
      [4, 0],
      [0, 4]
    ];
    
    this.initialized = false;
  }

  // Initialize filter with first position
  initialize(x, y) {
    this.state = [x, y, 0, 0]; // Position with zero velocity
    this.initialized = true;
  }

  // Predict step
  predict(vx = 0, vy = 0, dt = 1.0) {
    if (!this.initialized) return;

    // State transition matrix F (4x4)
    const F = [
      [1, 0, dt, 0],
      [0, 1, 0, dt],
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ];

    // Control input matrix B (4x2)
    const B = [
      [0.5 * dt * dt, 0],
      [0, 0.5 * dt * dt],
      [dt, 0],
      [0, dt]
    ];

    // Control input u (acceleration)
    const u = [vx / dt, vy / dt]; // Convert velocity to acceleration

    // Predict state: x = F * x + B * u
    const newState = this.matrixVectorMultiply(F, this.state);
    const controlContribution = this.matrixVectorMultiply(B, u);
    
    for (let i = 0; i < 4; i++) {
      this.state[i] = newState[i] + controlContribution[i];
    }

    // Predict covariance: P = F * P * F^T + Q
    const FP = this.matrixMultiply(F, this.P);
    const FPFt = this.matrixMultiply(FP, this.transpose(F));
    this.P = this.matrixAdd(FPFt, this.Q);
  }

  // Update step with measurement
  update(measuredX, measuredY) {
    if (!this.initialized) {
      this.initialize(measuredX, measuredY);
      return { x: measuredX, y: measuredY };
    }

    // Measurement vector
    const z = [measuredX, measuredY];

    // Measurement matrix H (2x4) - we only measure position
    const H = [
      [1, 0, 0, 0],
      [0, 1, 0, 0]
    ];

    // Innovation: y = z - H * x
    const Hx = this.matrixVectorMultiply(H, this.state);
    const innovation = [z[0] - Hx[0], z[1] - Hx[1]];

    // Innovation covariance: S = H * P * H^T + R
    const HP = this.matrixMultiply(H, this.P);
    const HPHt = this.matrixMultiply(HP, this.transpose(H));
    const S = this.matrixAdd(HPHt, this.R);

    // Kalman gain: K = P * H^T * S^(-1)
    const PHt = this.matrixMultiply(this.P, this.transpose(H));
    const Sinv = this.matrixInvert2x2(S);
    const K = this.matrixMultiply(PHt, Sinv);

    // Update state: x = x + K * y
    const Ky = this.matrixVectorMultiply(K, innovation);
    for (let i = 0; i < 4; i++) {
      this.state[i] += Ky[i];
    }

    // Update covariance: P = (I - K * H) * P
    const I = this.identityMatrix(4);
    const KH = this.matrixMultiply(K, H);
    const IKH = this.matrixSubtract(I, KH);
    this.P = this.matrixMultiply(IKH, this.P);

    return {
      x: this.state[0],
      y: this.state[1],
      vx: this.state[2],
      vy: this.state[3]
    };
  }

  // Get current state
  getState() {
    return {
      x: this.state[0],
      y: this.state[1],
      vx: this.state[2],
      vy: this.state[3]
    };
  }

  // Matrix operations
  matrixMultiply(A, B) {
    const rowsA = A.length;
    const colsA = A[0].length;
    const colsB = B[0].length;
    
    const result = Array(rowsA).fill().map(() => Array(colsB).fill(0));
    
    for (let i = 0; i < rowsA; i++) {
      for (let j = 0; j < colsB; j++) {
        for (let k = 0; k < colsA; k++) {
          result[i][j] += A[i][k] * B[k][j];
        }
      }
    }
    
    return result;
  }

  matrixVectorMultiply(matrix, vector) {
    const rows = matrix.length;
    const result = Array(rows).fill(0);
    
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < vector.length; j++) {
        result[i] += matrix[i][j] * vector[j];
      }
    }
    
    return result;
  }

  matrixAdd(A, B) {
    const rows = A.length;
    const cols = A[0].length;
    const result = Array(rows).fill().map(() => Array(cols).fill(0));
    
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        result[i][j] = A[i][j] + B[i][j];
      }
    }
    
    return result;
  }

  matrixSubtract(A, B) {
    const rows = A.length;
    const cols = A[0].length;
    const result = Array(rows).fill().map(() => Array(cols).fill(0));
    
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        result[i][j] = A[i][j] - B[i][j];
      }
    }
    
    return result;
  }

  transpose(matrix) {
    const rows = matrix.length;
    const cols = matrix[0].length;
    const result = Array(cols).fill().map(() => Array(rows).fill(0));
    
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        result[j][i] = matrix[i][j];
      }
    }
    
    return result;
  }

  identityMatrix(size) {
    const result = Array(size).fill().map(() => Array(size).fill(0));
    for (let i = 0; i < size; i++) {
      result[i][i] = 1;
    }
    return result;
  }

  // 2x2 Matrix inversion (for innovation covariance)
  matrixInvert2x2(matrix) {
    const [[a, b], [c, d]] = matrix;
    const det = a * d - b * c;
    
    if (Math.abs(det) < 1e-10) {
      // Matrix is singular, return identity
      return [[1, 0], [0, 1]];
    }
    
    return [
      [d / det, -b / det],
      [-c / det, a / det]
    ];
  }

  // Reset filter
  reset() {
    this.state = [0, 0, 0, 0];
    this.P = [
      [1000, 0, 0, 0],
      [0, 1000, 0, 0],
      [0, 0, 1000, 0],
      [0, 0, 0, 1000]
    ];
    this.initialized = false;
  }

  // Set process noise
  setProcessNoise(positionNoise, velocityNoise) {
    this.Q = [
      [positionNoise, 0, 0, 0],
      [0, positionNoise, 0, 0],
      [0, 0, velocityNoise, 0],
      [0, 0, 0, velocityNoise]
    ];
  }

  // Set measurement noise
  setMeasurementNoise(noise) {
    this.R = [
      [noise, 0],
      [0, noise]
    ];
  }
}

export { KalmanFilter };