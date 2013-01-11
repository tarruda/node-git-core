// the delta encoding used by git was inferred by reading the original
// source at https://github.com/git/git/blob/master/patch-delta.c
var MIN_COPY_LENGTH = 4; // minimum match length for copy instruction
                        


// produces a buffer that is the result of 'delta' applied to 'base'
function patchDelta(base, delta) {
  var rv, opcode, baseOffset, copyLength
    , rvOffset = 0
    , header = decodeHeader(delta)
    , offset = header[2];

  // assert the size of the base buffer
  if (header[0] !== base.length)
    throw new Error('Invalid base buffer length in header');

  // pre allocate buffer to hold the results
  rv = new Buffer(header[1]);

  // start patching
  while (offset < delta.length) {
    opcode = delta[offset++];
    if (opcode & 0x80) {
      // copy instruction (copy bytes from base buffer to target buffer)
      baseOffset = 0;
      copyLength = 0;
      // the state of the next bits will tell us information we need
      // to perform the copy
      // first we get the offset in the source buffer where 
      // the copy will start
      if (opcode & 0x01) baseOffset = delta[offset++];
      if (opcode & 0x02) baseOffset |= delta[offset++] << 8;
      if (opcode & 0x04) baseOffset |= delta[offset++] << 16;
      if (opcode & 0x08) baseOffset |= delta[offset++] << 24;
      // now the amount of bytes to copy
      if (opcode & 0x10) copyLength = delta[offset++];
      if (opcode & 0x20) copyLength |= delta[offset++] << 8;
      if (opcode & 0x40) copyLength |= delta[offset++] << 16;
      if (copyLength === 0) copyLength = 0x10000;
      // copy the data
      base.copy(rv, rvOffset, baseOffset, baseOffset + copyLength);
    } else if (opcode) {
      // insert instruction (copy bytes from delta buffer to target buffer)
      // amount to copy is specified by the opcode itself
      copyLength = opcode;
      delta.copy(rv, rvOffset, offset, offset + copyLength); 
      offset += copyLength;
    } else {
      throw new Error('Invalid delta opcode');
    }
    // advance target position
    rvOffset += copyLength;
  }

  // assert the size of the target buffer
  if (rvOffset !== rv.length)
    throw new Error('Error patching the base buffer');

  return rv;
}

// produces a buffer that contains instructions on how to
// construct 'target' from 'source' using copy/insert encoding.
// adapted on the algorithm described in the paper
// 'File System Support for Delta Compression'.
// key differences are:
//  - instead of using fingerprints as keys of the hash table,
//    we use buffers and never clobber existing entries
//  - The block size is variable and determined by linefeeds or
//    chunk of 90 bytes whatever comes first
//
// this is slow and was added more as a utility for testing
// 'patchDelta' and documenting git delta encoding, so it 
// should not be used indiscriminately
function diffDelta(source, target) {
  var block, matchOffset, matchLength, insertLength
    , i = 0
    , insertBuffer = new Buffer(127)
    , bufferedLength = 0
    , blocks = new Blocks(1103)
    , opcodes = [];

  // first step is to encode the source and target sizes
  encodeHeader(opcodes, source.length, target.length);

  // now build the hashtable containing the lines/blocks
  while (i < source.length) {
    block = sliceBlock(source, i);
    blocks.set(block, i);
    i += block.length;
  }

  // now walk the target, looking for block matches
  i = 0;
  while (i < target.length) {
    block = sliceBlock(target, i); 
    matchLength = 0;
    matchOffset = blocks.get(block);
    if (typeof matchOffset === 'number')
      // match found, find the length
      matchLength = getMatchLength(source, matchOffset, target, i);
    if (matchLength < MIN_COPY_LENGTH) {
      // this will happen when a match is not found or it is too short
      // either way we will insert or buffer data
      insertLength = block.length + matchLength;
      if (bufferedLength + insertLength <= insertBuffer.length) {
        // buffer as much data as permitted(127)
        target.copy(insertBuffer, bufferedLength, i, i + insertLength);
        bufferedLength += insertLength;
      } else {
        // emit insert for the buffered data
        emitInsert(opcodes, insertBuffer, bufferedLength);
        // start buffering again
        target.copy(insertBuffer, 0, i, i + insertLength);
        bufferedLength = insertLength;
      }
      i += insertLength;
    } else {
      if (bufferedLength) {
        // pending buffered data, flush it before copying
        emitInsert(opcodes, insertBuffer, bufferedLength);
        bufferedLength = 0;
      }
      emitCopy(opcodes, source, matchOffset, matchLength);
      i += matchLength;
    }
  }

  if (bufferedLength) {
    // pending buffered
    emitInsert(opcodes, insertBuffer, bufferedLength);
    bufferedLength = 0;
  }

  // some assertion here won't hurt development
  if (i !== target.length) // TODO remove
    throw new Error('Error computing delta buffer');

  return new Buffer(opcodes);
}

// hashtable where keys are Buffer instances
function Blocks(n) {
  this.array = new Array(n);
  this.n = n;
}

Blocks.prototype.get = function(key) {
  var hashValue = hash(key)
    , idx = hashValue % this.n;

  if (this.array[idx])
    return this.array[idx].get(key);
};

Blocks.prototype.set = function(key, value) {
  var hashValue = hash(key)
    , idx = hashValue % this.n;

  if (this.array[idx])
    this.array[idx].set(key, value);
  else
    this.array[idx] = new Bucket(key, value);
};

function Bucket(key, value) {
  this.key = key;
  this.value = value;
}

function compareBuffers(a, b) {
  var i = 0;

  if (a.length !== b.length)
    return false;

  while (i < a.length && a[i] === b[i]) i++;

  if (i !== a.length)
    return false;

  return true;
}

Bucket.prototype.get = function(key) {
  var node = this;

  while (node && !compareBuffers(node.key, key))
    node = node.next;

  if (node)
    return node.value;
};

Bucket.prototype.set = function(key, value) {
  var node = this;

  while (!compareBuffers(node.key, key) && node.next)
    node = node.next;

  if (compareBuffers(node.key, key))
    node.value = value;
  else
    node.next = new Bucket(key, value);
};

function hash(buffer) {
  var w = 1 
    , rv = 0
    , i = 0
    , j = buffer.length;

  while (i < j) {
    w *= 29;
    w %= (1 << 30);
    rv += buffer[i++] * w;
    rv %= (1 << 30);
  }

  return rv;
}


// function used to split buffers into blocks(units for matching regions
// in 'diffDelta')
function sliceBlock(buffer, pos) {
  var j = pos;

  // advance until a block boundary is found
  while (buffer[j] !== 10 && (j - pos < 90) && j < buffer.length) j++;
  if (buffer[j] === 10) j++; // append the trailing linefeed to the block

  return buffer.slice(pos, j);
}


// the insert instruction is just the number of bytes to copy from 
// delta buffer(following the opcode) to target buffer.
// it must be less than 128 since when the MSB is set it will be a
// copy opcode
function emitInsert(opcodes, buffer, length) {
  var i;

  if (length > 127) // TODO remove
    throw new Error('invalid insert opcode');

  opcodes.push(length);

  for (i = 0; i < length; i++) {
    opcodes.push(buffer[i]);
  }
}

function emitCopy(opcodes, source, offset, length) {
  var code, codeIdx;
 
  opcodes.push(null);
  codeIdx = opcodes.length - 1;
  code = 0x80 // set the MSB

  // offset and length are written using a compact encoding
  if (offset & 0xff) {
    opcodes.push(offset & 0xff);
    code |= 0x01;
  }

  if (offset & 0xff00) {
    opcodes.push((offset & 0xff00) >>> 8);
    code |= 0x02;
  }

  if (offset & 0xff0000) {
    opcodes.push((offset & 0xff0000) >>> 16);
    code |= 0x04;
  }

  if (offset & 0xff000000) {
    opcodess.push((offset & 0xff000000) >>> 24);
    code |= 0x08;
  }
  
  if (length & 0xff) {
    opcodes.push(length & 0xff);
    code |= 0x10;
  }

  if (length & 0xff00) {
    opcodes.push((length & 0xff00) >>> 8);
    code |= 0x20;
  }

  if (length & 0xff0000) {
    opcodes.push((length & 0xff0000) >>> 16);
    code |= 0x40;
  }

  // place the code at its position
  opcodes[codeIdx] = code;
}

function getMatchLength(source, sourcePos, target, targetPos) {
  var rv = 0;

  while (source[sourcePos++] === target[targetPos++]) rv++;

  return rv;
}


// gets sizes of the base buffer/target buffer formatted in LEB128 and
// the delta header length
function decodeHeader(buffer) {
  var offset = 0;

  function nextSize() {
    var rv = buffer[offset]
      , bits = 7;

    while (buffer[offset++] & 0x80) {
      rv |= (buffer[offset] & 0x7f) << bits;
      bits += 7;
    }

    return rv;
  }

  return [nextSize(), nextSize(), offset];
}

function encodeHeader(opcodes, baseSize, targetSize) {

  function encode(size) {
    opcodes.push(size & 0x7f);
    size >>>= 7;

    while (size > 0) {
      // this means size continues, set the MSB
      opcodes[opcodes.length - 1] |= 0x80;
      opcodes.push(size & 0x7f);
      size >>>= 7;
    }
  }

  encode(baseSize);
  encode(targetSize);
}

exports.patchDelta = patchDelta;
exports.diffDelta = diffDelta;
