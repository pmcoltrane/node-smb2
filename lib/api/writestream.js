

var SMB2Forge = require('../tools/smb2-forge')
  , SMB2Request = SMB2Forge.request
  , bigint = require('../tools/bigint')
  , stream = require('stream')
  ;

/*
 * writeStream
 * =========
 *
 * create and write file on the share
 *
 *  - create the file
 *
 *  - set info of the file
 *
 *  - set content of the file
 *
 *  - close the file
 *
 */
module.exports = function(filename, data, options, cb){

  if(typeof options == 'function'){
    cb = options;
    options = {};
  }
  
  function isReadableStream(obj) {
    return obj instanceof stream.Stream &&
    typeof (obj._read === 'function') &&
    typeof (obj._readableState === 'object' );
  }

  options.encoding = options.encoding || 'utf8';
  
  if( !data.hasOwnProperty('stream') || !isReadableStream(data.stream) ) throw new Error('data.stream is not readable.');
  if( !data.hasOwnProperty('length') ) throw new Error('data.length must be specified.');
  
  var connection = this
    , file
    , fileContent = data.stream
    , fileLength = new bigint(8, data.length)
    ;

  function createFile(fileCreated){
    SMB2Request('create', {path:filename}, connection, function(err, f){
      if(err) cb && cb(err);
      // SMB2 set file size
      else {
        file = f;
        fileCreated();
      }
    });
  }

  function closeFile(fileClosed){
    SMB2Request('close', file, connection, function(err){
      if(err) cb && cb(err);
      else {
        file = null;
        fileClosed();
      }
    });
  }

  function setFileSize(fileSizeSetted){
    SMB2Request('set_info', {FileId:file.FileId, FileInfoClass:'FileEndOfFileInformation', Buffer:fileLength.toBuffer()}, connection, function(err){
      if(err) cb && cb(err);
      else fileSizeSetted();
    });
  }

  function streamFile(fileWritten){
    // changes:
    // read from stream ("fileContent" in closure)
    // on stream.data, use createPackets() as a framework for sending individual packets
    // on stream.end, call fileWritten()
    // no need to track offset and such
    var offset = new bigint(8)
      , stop = false
      , maxPacketSize = new bigint(8, 0x00010000 - 0x71)
      , maxPacket = maxPacketSize.toNumber()
      ;
      
    var chunkCount = 0;
    
    function callback(offset){
      return function(err){
        if(stop) return;
        if(err) {
          cb && cb(err);
          stop = true;
        }
      } 
    }
    
    function sendSizedChunk(chunk){
      SMB2Request('write', {
        'FileId': file.FileId,
        'Offset': offset.toBuffer(),
        'Buffer': chunk
      }, connection, callback(offset));
      offset = offset.add(chunk.length);
      chunkCount++;
    }
    
    fileContent.on('data', function(chunk){

      if(chunk.length > maxPacket){
        for(var i=0; i<chunk.length; i+=maxPacket){
          var endLength = Math.min(maxPacket, chunk.length - i);
          var sizedChunk = chunk.slice(i, i + endLength);
          sendSizedChunk(sizedChunk);          
        }
      }
      else{
        sendSizedChunk(chunk); 
      }
    });
    fileContent.on('end', function(err){
      fileWritten();
    });
    
    
  }


  createFile(function(){
    setFileSize(function(){
      streamFile(function(){
        closeFile(cb);
      });
    });
  });

}
