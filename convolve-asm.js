const r=(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
'use strict';

function FFT(size) {
  this.size = size | 0;
  if (this.size <= 1 || (this.size & (this.size - 1)) !== 0)
    throw new Error('FFT size must be a power of two and bigger than 1');

  this._csize = size << 1;

  // NOTE: Use of `var` is intentional for old V8 versions
  var table = new Float32Array(this.size * 2);
  for (var i = 0; i < table.length; i += 2) {
    const angle = Math.PI * i / this.size;
    table[i] = Math.cos(angle);
    table[i + 1] = -Math.sin(angle);
  }
  this.table = table;

  // Find size's power of two
  var power = 0;
  for (var t = 1; this.size > t; t <<= 1)
    power++;

  // Calculate initial step's width:
  //   * If we are full radix-4 - it is 2x smaller to give inital len=8
  //   * Otherwise it is the same as `power` to give len=4
  this._width = power % 2 === 0 ? power - 1 : power;

  // Pre-compute bit-reversal patterns
  this._bitrev = new Float32Array(1 << this._width);
  for (var j = 0; j < this._bitrev.length; j++) {
    this._bitrev[j] = 0;
    for (var shift = 0; shift < this._width; shift += 2) {
      var revShift = this._width - shift - 2;
      this._bitrev[j] |= ((j >>> shift) & 3) << revShift;
    }
  }

  // var maxLen = 8192
  // var maxBytes = 65536 // maxLen * Float64Array.BYTES_PER_ELEMENT

  this._heap = new ArrayBuffer(this.size*8*4)
  // var input = new Float64Array(heap, maxBytes, maxLen)
  // var output = new Float64Array(heap, maxBytes*2, maxLen/2)
  this._rfft = FFTasm({Math: Math, Float64Array: Float64Array}, null, this._heap)


  this._out = null;
  this._data = null;
  this._inv = 0;
}
module.exports = FFT;

FFT.prototype.fromComplexArray = function fromComplexArray(complex, storage) {
  var res = storage || new Float32Array(complex.length >>> 1);
  for (var i = 0; i < complex.length; i += 2)
    res[i >>> 1] = complex[i];
  return res;
};

FFT.prototype.createComplexArray = function createComplexArray() {
  const res = new Float32Array(this._csize);
  for (var i = 0; i < res.length; i++)
    res[i] = 0;
  return res;
};

FFT.prototype.toComplexArray = function toComplexArray(input, storage) {
  var res = storage || this.createComplexArray();
  for (var i = 0; i < res.length; i += 2) {
    res[i] = input[i >>> 1];
    res[i + 1] = 0;
  }
  return res;
};

FFT.prototype.completeSpectrum = function completeSpectrum(spectrum) {
  var size = this._csize;
  var half = size >>> 1;
  for (var i = 2; i < half; i += 2) {
    spectrum[size - i] = spectrum[i];
    spectrum[size - i + 1] = -spectrum[i + 1];
  }
};

FFT.prototype.transform = function transform(out, data) {
  if (out === data)
    throw new Error('Input and output buffers must be different');

  this._out = out;
  this._data = data;
  this._inv = 0;
  // this._transform4();
  this.transformAsm();
  this._out = null;
  this._data = null;
};

function FFTasm(stdlib, foreign, heap) {
  'use asm'

  var TAU = 6.283185307179586
    var sqrt = stdlib.Math.sqrt
    var sin = stdlib.Math.sin
    var cos = stdlib.Math.cos
    var abs = stdlib.Math.abs
    var SQRT1_2 = stdlib.Math.SQRT1_2
    var imul = stdlib.Math.imul

  //memory layout is [x, input, output]
    var arr = new stdlib.Float64Array(heap)
    var x = new stdlib.Float64Array(heap)
  var input = 8192
  var output = 16384

  function rfft (n, k) {
        n = n|0
        k = k|0

    //.forward call
    var i         = 0, j = 0,
      bSi       = 0.0,
      n2 = 0, n4 = 0, n8 = 0, nn = 0,
      t1 = 0.0, t2 = 0.0, t3 = 0.0, t4 = 0.0,
      i1 = 0, i2 = 0, i3 = 0, i4 = 0, i5 = 0, i6 = 0, i7 = 0, i8 = 0,
      st1 = 0.0, cc1 = 0.0, ss1 = 0.0, cc3 = 0.0, ss3 = 0.0,
      e = 0.0,
      a = 0.0,
      rval = 0.0, ival = 0.0, mag = 0.0, xxx = 0.0
        var ix = 0, i0 = 0, id = 0

        i = n >>> 1
        bSi = 2.0 / +(n|0)

    reverseBinPermute(n)

    for (ix = 0, id = 4; (ix|0) < (n|0); id = imul(id, 4)) {
      for (i0 = ix; (i0|0) < (n|0); i0 = i0 + id|0) {
        //sumdiff(x[i0], x[i0+1]) // {a, b}  <--| {a+b, a-b}
        st1 = x[i0 << 3 >> 3] - x[i0+1 << 3 >> 3]
        x[i0 << 3 >> 3] = x[i0 << 3 >> 3] + x[i0+1 << 3 >> 3]
        x[i0+1 << 3 >> 3] = st1
      }
      ix = imul(2, (id-1))
    }

    n2 = 2
    nn = n >>> 1

    while((nn = nn >>> 1)) {
      ix = 0
      n2 = n2 << 1
      id = n2 << 1
      n4 = n2 >>> 2
      n8 = n2 >>> 3
      do {
        if((n4|0) != 1) {
          for(i0 = ix; (i0|0) < (n|0); i0 = i0 + id|0) {
            i1 = i0
            i2 = i1 + n4|0
            i3 = i2 + n4|0
            i4 = i3 + n4|0

            //diffsum3_r(x[i3], x[i4], t1) // {a, b, s} <--| {a, b-a, a+b}
            t1 = x[i3 << 3 >> 3] + x[i4 << 3 >> 3]
            x[i4 << 3 >> 3] = x[i4 << 3 >> 3] - x[i3 << 3 >> 3]
            //sumdiff3(x[i1], t1, x[i3])   // {a, b, d} <--| {a+b, b, a-b}
            x[i3 << 3 >> 3] = x[i1 << 3 >> 3] - t1
            x[i1 << 3 >> 3] = x[i1 << 3 >> 3] + t1

            i1 = i1 + n8|0
            i2 = i2 + n8|0
            i3 = i3 + n8|0
            i4 = i4 + n8|0

            //sumdiff(x[i3], x[i4], t1, t2) // {s, d}  <--| {a+b, a-b}
            t1 = x[i3 << 3 >> 3] + x[i4 << 3 >> 3]
            t2 = x[i3 << 3 >> 3] - x[i4 << 3 >> 3]

            t1 = -t1 * SQRT1_2
            t2 = t2 * SQRT1_2

            // sumdiff(t1, x[i2], x[i4], x[i3]) // {s, d}  <--| {a+b, a-b}
            st1 = +(x[i2 << 3 >> 3])
            x[i4 << 3 >> 3] = t1 + st1
            x[i3 << 3 >> 3] = t1 - st1

            //sumdiff3(x[i1], t2, x[i2]) // {a, b, d} <--| {a+b, b, a-b}
            x[i2 << 3 >> 3] = x[i1 << 3 >> 3] - t2
            x[i1 << 3 >> 3] = x[i1 << 3 >> 3] + t2
          }
        } else {
          for(i0 = ix; (i0|0) < (n|0); i0 = i0 + id|0) {
            i1 = i0
            i2 = i1 + n4|0
            i3 = i2 + n4|0
            i4 = i3 + n4|0

            //diffsum3_r(x[i3], x[i4], t1) // {a, b, s} <--| {a, b-a, a+b}
            t1 = x[i3 << 3 >> 3] + x[i4 << 3 >> 3]
            x[i4 << 3 >> 3] = x[i4 << 3 >> 3] - x[i3 << 3 >> 3]

            //sumdiff3(x[i1], t1, x[i3])   // {a, b, d} <--| {a+b, b, a-b}
            x[i3 << 3 >> 3] = x[i1 << 3 >> 3] - t1
            x[i1 << 3 >> 3] = x[i1 << 3 >> 3] + t1
          }
        }

        ix = (id << 1) - n2|0
        id = id << 2
      } while ((ix|0) < (n|0))

      e = TAU / +(n2|0)

      for (j = 1; (j|0) < (n8|0); j = j + 1|0) {
        a = +(j|0) * e
        ss1 = sin(a)
        cc1 = cos(a)

        //ss3 = sin(3*a) cc3 = cos(3*a)
        cc3 = 4.0*cc1*(cc1*cc1-0.75)
        ss3 = 4.0*ss1*(0.75-ss1*ss1)

        ix = 0; id = n2 << 1
        do {
          for (i0 = ix; (i0|0) < (n|0); i0 = i0 + id|0) {
            i1 = i0 + j|0
            i2 = i1 + n4|0
            i3 = i2 + n4|0
            i4 = i3 + n4|0

            i5 = i0 + n4 - j|0
            i6 = i5 + n4|0
            i7 = i6 + n4|0
            i8 = i7 + n4|0

            //cmult(c, s, x, y, &u, &v)
            //cmult(cc1, ss1, x[i7], x[i3], t2, t1) // {u,v} <--| {x*c-y*s, x*s+y*c}
            t2 = x[i7 << 3 >> 3]*cc1 - x[i3 << 3 >> 3]*ss1
            t1 = x[i7 << 3 >> 3]*ss1 + x[i3 << 3 >> 3]*cc1

            //cmult(cc3, ss3, x[i8], x[i4], t4, t3)
            t4 = x[i8 << 3 >> 3]*cc3 - x[i4 << 3 >> 3]*ss3
            t3 = x[i8 << 3 >> 3]*ss3 + x[i4 << 3 >> 3]*cc3

            //sumdiff(t2, t4)   // {a, b} <--| {a+b, a-b}
            st1 = t2 - t4
            t2 = t2 + t4
            t4 = st1

            //sumdiff(t2, x[i6], x[i8], x[i3]) // {s, d}  <--| {a+b, a-b}
            //st1 = x[i6] x[i8] = t2 + st1 x[i3] = t2 - st1
            x[i8 << 3 >> 3] = t2 + x[i6 << 3 >> 3]
            x[i3 << 3 >> 3] = t2 - x[i6 << 3 >> 3]

            //sumdiff_r(t1, t3) // {a, b} <--| {a+b, b-a}
            st1 = t3 - t1
            t1 = t1 + t3
            t3 = st1

            //sumdiff(t3, x[i2], x[i4], x[i7]) // {s, d}  <--| {a+b, a-b}
            //st1 = x[i2] x[i4] = t3 + st1 x[i7] = t3 - st1
            x[i4 << 3 >> 3] = t3 + x[i2 << 3 >> 3]
            x[i7 << 3 >> 3] = t3 - x[i2 << 3 >> 3]

            //sumdiff3(x[i1], t1, x[i6])   // {a, b, d} <--| {a+b, b, a-b}
            x[i6 << 3 >> 3] = x[i1 << 3 >> 3] - t1
            x[i1 << 3 >> 3] = x[i1 << 3 >> 3] + t1

            //diffsum3_r(t4, x[i5], x[i2]) // {a, b, s} <--| {a, b-a, a+b}
            x[i2 << 3 >> 3] = t4 + x[i5 << 3 >> 3]
            x[i5 << 3 >> 3] = x[i5 << 3 >> 3] - t4
          }

          ix = (id << 1) - n2|0
          id = id << 2

        } while ((ix|0) < (n|0))
      }
    }

    while (i = i - 1|0) {
      rval = +(x[i << 3 >> 3])
      ival = +(x[n-i-1 << 3 >> 3])
      mag = bSi * sqrt(rval * rval + ival * ival)
      arr[output + i << 3 >> 3] = mag
    }

    arr[output + 0 << 3 >> 3] = abs(bSi * x[0 << 3 >> 3])
  }


  function reverseBinPermute (n) {
        n = n|0

    var halfSize    = 0,
      nm1         = 0,
      i = 1, r = 0, h = 0

    halfSize = n >>> 1
    nm1 = n - 1|0

    x[0 << 3 >> 3] = arr[input + 0 << 3 >> 3]

    do {
      r = r + halfSize|0
      x[i << 3 >> 3] = arr[input + r << 3 >> 3]
      x[r << 3 >> 3] = arr[input + i << 3 >> 3]

      i = i + 1|0

      h = halfSize << 1

      while (h = h >> 1, ((r = r ^ h) & h) == 0) {

      }

      if ((r|0) >= (i|0)) {
        x[i << 3 >> 3]     = arr[input + r << 3 >> 3]
        x[r << 3 >> 3]     = arr[input + i << 3 >> 3]

        x[nm1-i << 3 >> 3] = arr[input + nm1-r << 3 >> 3]
        x[nm1-r << 3 >> 3] = arr[input + nm1-i << 3 >> 3]
      }
      i = i + 1|0
    } while ((i|0) < (halfSize|0))

    x[nm1 << 3 >> 3] = arr[input + nm1 << 3 >> 3]

  }

  return rfft
}


FFT.prototype.transformAsm = function (out, src) {
  // if (!this._data) throw Error('Input data is not provided, pass an array.')

  var n = this._data.length
  // if (n > maxLen) throw Error('Input length is too big, must be under ' + maxLen)

  var k = Math.floor(Math.log(n) / Math.LN2)
  if (Math.pow(2, k) !== n) throw Error('Invalid array size, must be a power of 2.')

  var input = new Float64Array(this._heap, this.size*8, this.size)
  var output = new Float64Array(this._heap, this.size*8*2, this.size/2)

  input.set(this._data.buffer)

  this._rfft(n, k)

  this._out.set(output.subarray(0, n/2))
}

FFT.prototype.realTransform = function realTransform(out, data) {
  if (out === data)
    throw new Error('Input and output buffers must be different');

  this._out = out;
  this._data = data;
  this._inv = 0;
  this._realTransform4();
  this._out = null;
  this._data = null;
};

FFT.prototype.inverseTransform = function inverseTransform(out, data) {
  if (out === data)
    throw new Error('Input and output buffers must be different');

  this._out = out;
  this._data = data;
  this._inv = 1;
  this._transform4();
  for (var i = 0; i < out.length; i++)
    out[i] /= this.size;
  this._out = null;
  this._data = null;
};

// radix-4 implementation
//
// NOTE: Uses of `var` are intentional for older V8 version that do not
// support both `let compound assignments` and `const phi`
FFT.prototype._transform4 = function _transform4() {
  var out = this._out;
  var size = this._csize;

  // Initial step (permute and transform)
  var width = this._width;
  var step = 1 << width;
  var len = (size / step) << 1;

  var outOff;
  var t;
  var bitrev = this._bitrev;
  if (len === 4) {
    for (outOff = 0, t = 0; outOff < size; outOff += len, t++) {
      const off = bitrev[t];
      this._singleTransform2(outOff, off, step);
    }
  } else {
    // len === 8
    for (outOff = 0, t = 0; outOff < size; outOff += len, t++) {
      const off = bitrev[t];
      this._singleTransform4(outOff, off, step);
    }
  }

  // Loop through steps in decreasing order
  var inv = this._inv ? -1 : 1;
  var table = this.table;
  for (step >>= 2; step >= 2; step >>= 2) {
    len = (size / step) << 1;
    var quarterLen = len >>> 2;

    // Loop through offsets in the data
    for (outOff = 0; outOff < size; outOff += len) {
      // Full case
      var limit = outOff + quarterLen;
      for (var i = outOff, k = 0; i < limit; i += 2, k += step) {
        const A = i;
        const B = A + quarterLen;
        const C = B + quarterLen;
        const D = C + quarterLen;

        // Original values
        const Ar = out[A];
        const Ai = out[A + 1];
        const Br = out[B];
        const Bi = out[B + 1];
        const Cr = out[C];
        const Ci = out[C + 1];
        const Dr = out[D];
        const Di = out[D + 1];

        // Middle values
        const MAr = Ar;
        const MAi = Ai;

        const tableBr = table[k];
        const tableBi = inv * table[k + 1];
        const MBr = Br * tableBr - Bi * tableBi;
        const MBi = Br * tableBi + Bi * tableBr;

        const tableCr = table[2 * k];
        const tableCi = inv * table[2 * k + 1];
        const MCr = Cr * tableCr - Ci * tableCi;
        const MCi = Cr * tableCi + Ci * tableCr;

        const tableDr = table[3 * k];
        const tableDi = inv * table[3 * k + 1];
        const MDr = Dr * tableDr - Di * tableDi;
        const MDi = Dr * tableDi + Di * tableDr;

        // Pre-Final values
        const T0r = MAr + MCr;
        const T0i = MAi + MCi;
        const T1r = MAr - MCr;
        const T1i = MAi - MCi;
        const T2r = MBr + MDr;
        const T2i = MBi + MDi;
        const T3r = inv * (MBr - MDr);
        const T3i = inv * (MBi - MDi);

        // Final values
        const FAr = T0r + T2r;
        const FAi = T0i + T2i;

        const FCr = T0r - T2r;
        const FCi = T0i - T2i;

        const FBr = T1r + T3i;
        const FBi = T1i - T3r;

        const FDr = T1r - T3i;
        const FDi = T1i + T3r;

        out[A] = FAr;
        out[A + 1] = FAi;
        out[B] = FBr;
        out[B + 1] = FBi;
        out[C] = FCr;
        out[C + 1] = FCi;
        out[D] = FDr;
        out[D + 1] = FDi;
      }
    }
  }
};

// radix-2 implementation
//
// NOTE: Only called for len=4
FFT.prototype._singleTransform2 = function _singleTransform2(outOff, off,
                                                             step) {
  const out = this._out;
  const data = this._data;

  const evenR = data[off];
  const evenI = data[off + 1];
  const oddR = data[off + step];
  const oddI = data[off + step + 1];

  const leftR = evenR + oddR;
  const leftI = evenI + oddI;
  const rightR = evenR - oddR;
  const rightI = evenI - oddI;

  out[outOff] = leftR;
  out[outOff + 1] = leftI;
  out[outOff + 2] = rightR;
  out[outOff + 3] = rightI;
};

// radix-4
//
// NOTE: Only called for len=8
FFT.prototype._singleTransform4 = function _singleTransform4(outOff, off,
                                                             step) {
  const out = this._out;
  const data = this._data;
  const inv = this._inv ? -1 : 1;
  const step2 = step * 2;
  const step3 = step * 3;

  // Original values
  const Ar = data[off];
  const Ai = data[off + 1];
  const Br = data[off + step];
  const Bi = data[off + step + 1];
  const Cr = data[off + step2];
  const Ci = data[off + step2 + 1];
  const Dr = data[off + step3];
  const Di = data[off + step3 + 1];

  // Pre-Final values
  const T0r = Ar + Cr;
  const T0i = Ai + Ci;
  const T1r = Ar - Cr;
  const T1i = Ai - Ci;
  const T2r = Br + Dr;
  const T2i = Bi + Di;
  const T3r = inv * (Br - Dr);
  const T3i = inv * (Bi - Di);

  // Final values
  const FAr = T0r + T2r;
  const FAi = T0i + T2i;

  const FBr = T1r + T3i;
  const FBi = T1i - T3r;

  const FCr = T0r - T2r;
  const FCi = T0i - T2i;

  const FDr = T1r - T3i;
  const FDi = T1i + T3r;

  out[outOff] = FAr;
  out[outOff + 1] = FAi;
  out[outOff + 2] = FBr;
  out[outOff + 3] = FBi;
  out[outOff + 4] = FCr;
  out[outOff + 5] = FCi;
  out[outOff + 6] = FDr;
  out[outOff + 7] = FDi;
};

// Real input radix-4 implementation
FFT.prototype._realTransform4 = function _realTransform4() {
  var out = this._out;
  var size = this._csize;

  // Initial step (permute and transform)
  var width = this._width;
  var step = 1 << width;
  var len = (size / step) << 1;

  var outOff;
  var t;
  var bitrev = this._bitrev;
  if (len === 4) {
    for (outOff = 0, t = 0; outOff < size; outOff += len, t++) {
      const off = bitrev[t];
      this._singleRealTransform2(outOff, off >>> 1, step >>> 1);
    }
  } else {
    // len === 8
    for (outOff = 0, t = 0; outOff < size; outOff += len, t++) {
      const off = bitrev[t];
      this._singleRealTransform4(outOff, off >>> 1, step >>> 1);
    }
  }

  // Loop through steps in decreasing order
  var inv = this._inv ? -1 : 1;
  var table = this.table;
  for (step >>= 2; step >= 2; step >>= 2) {
    len = (size / step) << 1;
    var halfLen = len >>> 1;
    var quarterLen = halfLen >>> 1;
    var hquarterLen = quarterLen >>> 1;

    // Loop through offsets in the data
    for (outOff = 0; outOff < size; outOff += len) {
      for (var i = 0, k = 0; i <= hquarterLen; i += 2, k += step) {
        var A = outOff + i;
        var B = A + quarterLen;
        var C = B + quarterLen;
        var D = C + quarterLen;

        // Original values
        var Ar = out[A];
        var Ai = out[A + 1];
        var Br = out[B];
        var Bi = out[B + 1];
        var Cr = out[C];
        var Ci = out[C + 1];
        var Dr = out[D];
        var Di = out[D + 1];

        // Middle values
        var MAr = Ar;
        var MAi = Ai;

        var tableBr = table[k];
        var tableBi = inv * table[k + 1];
        var MBr = Br * tableBr - Bi * tableBi;
        var MBi = Br * tableBi + Bi * tableBr;

        var tableCr = table[2 * k];
        var tableCi = inv * table[2 * k + 1];
        var MCr = Cr * tableCr - Ci * tableCi;
        var MCi = Cr * tableCi + Ci * tableCr;

        var tableDr = table[3 * k];
        var tableDi = inv * table[3 * k + 1];
        var MDr = Dr * tableDr - Di * tableDi;
        var MDi = Dr * tableDi + Di * tableDr;

        // Pre-Final values
        var T0r = MAr + MCr;
        var T0i = MAi + MCi;
        var T1r = MAr - MCr;
        var T1i = MAi - MCi;
        var T2r = MBr + MDr;
        var T2i = MBi + MDi;
        var T3r = inv * (MBr - MDr);
        var T3i = inv * (MBi - MDi);

        // Final values
        var FAr = T0r + T2r;
        var FAi = T0i + T2i;

        var FBr = T1r + T3i;
        var FBi = T1i - T3r;

        out[A] = FAr;
        out[A + 1] = FAi;
        out[B] = FBr;
        out[B + 1] = FBi;

        // Output final middle point
        if (i === 0) {
          var FCr = T0r - T2r;
          var FCi = T0i - T2i;
          out[C] = FCr;
          out[C + 1] = FCi;
          continue;
        }

        // Do not overwrite ourselves
        if (i === hquarterLen)
          continue;

        // In the flipped case:
        // MAi = -MAi
        // MBr=-MBi, MBi=-MBr
        // MCr=-MCr
        // MDr=MDi, MDi=MDr
        var ST0r = T1r;
        var ST0i = -T1i;
        var ST1r = T0r;
        var ST1i = -T0i;
        var ST2r = -inv * T3i;
        var ST2i = -inv * T3r;
        var ST3r = -inv * T2i;
        var ST3i = -inv * T2r;

        var SFAr = ST0r + ST2r;
        var SFAi = ST0i + ST2i;

        var SFBr = ST1r + ST3i;
        var SFBi = ST1i - ST3r;

        var SA = outOff + quarterLen - i;
        var SB = outOff + halfLen - i;

        out[SA] = SFAr;
        out[SA + 1] = SFAi;
        out[SB] = SFBr;
        out[SB + 1] = SFBi;
      }
    }
  }
};

// radix-2 implementation
//
// NOTE: Only called for len=4
FFT.prototype._singleRealTransform2 = function _singleRealTransform2(outOff,
                                                                     off,
                                                                     step) {
  const out = this._out;
  const data = this._data;

  const evenR = data[off];
  const oddR = data[off + step];

  const leftR = evenR + oddR;
  const rightR = evenR - oddR;

  out[outOff] = leftR;
  out[outOff + 1] = 0;
  out[outOff + 2] = rightR;
  out[outOff + 3] = 0;
};

// radix-4
//
// NOTE: Only called for len=8
FFT.prototype._singleRealTransform4 = function _singleRealTransform4(outOff,
                                                                     off,
                                                                     step) {
  const out = this._out;
  const data = this._data;
  const inv = this._inv ? -1 : 1;
  const step2 = step * 2;
  const step3 = step * 3;

  // Original values
  const Ar = data[off];
  const Br = data[off + step];
  const Cr = data[off + step2];
  const Dr = data[off + step3];

  // Pre-Final values
  const T0r = Ar + Cr;
  const T1r = Ar - Cr;
  const T2r = Br + Dr;
  const T3r = inv * (Br - Dr);

  // Final values
  const FAr = T0r + T2r;

  const FBr = T1r;
  const FBi = -T3r;

  const FCr = T0r - T2r;

  const FDr = T1r;
  const FDi = T3r;

  out[outOff] = FAr;
  out[outOff + 1] = 0;
  out[outOff + 2] = FBr;
  out[outOff + 3] = FBi;
  out[outOff + 4] = FCr;
  out[outOff + 5] = 0;
  out[outOff + 6] = FDr;
  out[outOff + 7] = FDi;
};

},{}],2:[function(require,module,exports){
module.exports = nextPowerOfTwo

function nextPowerOfTwo (n) {
  if (n === 0) return 1
  n--
  n |= n >> 1
  n |= n >> 2
  n |= n >> 4
  n |= n >> 8
  n |= n >> 16
  return n+1
}
},{}],"ml-convolution":[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var FFT = _interopDefault(require('fft.js'));
var nextPOT = _interopDefault(require('next-power-of-two'));

function directConvolution(input, kernel) {
    const length = input.length + kernel.length - 1;
    const output = new Float32Array(length);
    output.fill(0);
    for (var i = 0; i < input.length; i++) {
        for (var j = 0; j < kernel.length; j++) {
            output[i + j] += input[i] * kernel[j];
        }
    }
    return output;
}

function fftConvolution(input, kernel) {
    const resultLength = input.length + kernel.length - 1;
    const fftLength = nextPOT(resultLength);

    const fft = new FFT(fftLength);

    const {output: fftKernel, input: result} = createPaddedFFt(kernel, fft, fftLength);
    const {output: fftInput} = createPaddedFFt(input, fft, fftLength);

    // reuse arrays
    const fftConv = fftInput;
    const conv = fftKernel;
    for (var i = 0; i < fftConv.length; i += 2) {
        const tmp = fftInput[i] * fftKernel[i] - fftInput[i + 1] * fftKernel[i + 1];
        fftConv[i + 1] = fftInput[i] * fftKernel[i + 1] + fftInput[i + 1] * fftKernel[i];
        fftConv[i] = tmp;
    }
    fft.inverseTransform(conv, fftConv);
    return fft.fromComplexArray(conv, result).slice(0, resultLength);
}

function createPaddedFFt(data, fft, length) {
    const input = new Float32Array(length);
    input.set(data)
    // var i = 0;
    // for (; i < data.length; i++) {
    //     input[i] = data[i];
    // }
    // for (;i < length; i++) {
    //     input[i] = 0;
    // }
    const fftInput = fft.toComplexArray(input);
    const output = fft.createComplexArray();
    fft.transform(output, fftInput);
    return {
        output,
        input,
        fftInput
    };
}

exports.directConvolution = directConvolution;
exports.fftConvolution = fftConvolution;

},{"fft.js":1,"next-power-of-two":2}]},{},[])

export default r('ml-convolution')