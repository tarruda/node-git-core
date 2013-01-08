// helper zlib functions for easily inflating/deflating git packed objects
#include <node.h>
#include <node_buffer.h>
#include <zlib.h>
#include <stdlib.h>
#include <iostream>

using namespace v8;
using namespace node;

void freeBuffer(char* pointer, void* hint) {
        free(pointer);
}

Handle<Value> wrapReturnCode(HandleScope* scope, int code) {
        Local<Number> num = Number::New(code);
        return scope->Close(num);
}

Handle<Value> deflate(const Arguments& args) {
        HandleScope scope;
        int rv;
        Local<Object> inBuffer = args[0]->ToObject();
        // get a pointer to the input buffer data
        unsigned char* inData = (unsigned char*)Buffer::Data(inBuffer);
        // length of the input buffer
        size_t inLength = Buffer::Length(inBuffer);
        // declare deflate structure
        z_stream strm;
        // set the default memory routines
        strm.zalloc = Z_NULL;
        strm.zfree = Z_NULL;
        strm.opaque = Z_NULL;
        // initialize the structure
        rv = deflateInit(&strm, Z_DEFAULT_COMPRESSION);
        if (rv != Z_OK)
                return wrapReturnCode(&scope, rv);
        // set the number of bytes to read, since we are compressing the buffer
        // in a single step, this is just the buffer length
        strm.avail_in = inLength;
        // set the uncompressed data pointer
        strm.next_in = inData;
        // find the maximum number of bytes needed to hold the compressed
        // data
        size_t outMaxLength = deflateBound(&strm, inLength);
        // allocate memory for compressed data
        unsigned char* outData = (unsigned char*)malloc(outMaxLength);
        if (outData == NULL)
                return wrapReturnCode(&scope, Z_MEM_ERROR);
        // set allocated memory info
        strm.avail_out = outMaxLength;
        strm.next_out = outData;
        // compress everything in one step
        rv = deflate(&strm, Z_FINISH);
        if (rv != Z_STREAM_END)
                return wrapReturnCode(&scope, rv);
        size_t outLength = outMaxLength - strm.avail_out;
        // free zlib allocated memory
        deflateEnd(&strm);
        // create the nodejs SlowBuffer to hold the compressed data
        Buffer* outBuffer = Buffer::New((char*)outData, outLength, freeBuffer, NULL);
        return scope.Close(outBuffer->handle_);
}

Handle<Value> inflate(const Arguments& args) {
        HandleScope scope;
        int rv;
        Local<Object> inBuffer = args[0]->ToObject();
        // length of the uncompressed data is available in the packfile
        // before the deflated stream, and is used to allocate the output
        // buffer
        Local<Object> uncompressedLength = args[1]->ToObject();
        unsigned char* inData = (unsigned char*)Buffer::Data(inBuffer);
        size_t inLength = Buffer::Length(inBuffer);
        z_stream strm;
        strm.zalloc = Z_NULL;
        strm.zfree = Z_NULL;
        strm.opaque = Z_NULL;
        // initialize avail_in/next_in so zlib can optimize
        // initial memory allocation
        strm.avail_in = inLength;
        strm.next_in = inData;
        rv = inflateInit(&strm);
        if (rv != Z_OK)
                return wrapReturnCode(&scope, rv);
        size_t outLength = uncompressedLength->Uint32Value();
        unsigned char* outData = (unsigned char*)malloc(outLength);
        if (outData == NULL)
                return wrapReturnCode(&scope, Z_MEM_ERROR);
        strm.avail_out = outLength;
        strm.next_out = outData;
        rv = inflate(&strm, Z_FINISH);
        if (rv != Z_STREAM_END)
                return wrapReturnCode(&scope, rv);
        // set the number of bytes read from the input buffer
        size_t bytesRead = inLength - strm.avail_in;
        deflateEnd(&strm);
        // create the slowbuffer containing inflated data
        Buffer* outBuffer = Buffer::New((char*)outData, (size_t)outLength, freeBuffer, NULL);
        // create a javascript array to hold the number of bytes read and
        // inflated data
        Handle<Array> array = Array::New(2);
        if (array.IsEmpty())
                return wrapReturnCode(&scope, Z_MEM_ERROR);
        array->Set(0, outBuffer->handle_);
        array->Set(1, Integer::New(bytesRead));
        return scope.Close(array);
}

void init(Handle<Object> target) {
        NODE_SET_METHOD(target, "deflate", deflate);
        NODE_SET_METHOD(target, "inflate", inflate);
        NODE_DEFINE_CONSTANT(target, Z_OK);
        NODE_DEFINE_CONSTANT(target, Z_STREAM_END);
        NODE_DEFINE_CONSTANT(target, Z_NEED_DICT);
        NODE_DEFINE_CONSTANT(target, Z_ERRNO);
        NODE_DEFINE_CONSTANT(target, Z_STREAM_ERROR);
        NODE_DEFINE_CONSTANT(target, Z_DATA_ERROR);
        NODE_DEFINE_CONSTANT(target, Z_MEM_ERROR);
        NODE_DEFINE_CONSTANT(target, Z_BUF_ERROR);
        NODE_DEFINE_CONSTANT(target, Z_VERSION_ERROR);
}

NODE_MODULE(binding, init);
