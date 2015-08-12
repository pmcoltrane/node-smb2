

var SMB2Forge = require('../tools/smb2-forge')
  , SMB2Request = SMB2Forge.request
  , bigint = require('../tools/bigint')
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

  options.encoding = options.encoding || 'utf8';

  var connection = this
    , file
    , fileContent = Buffer.isBuffer(data) ? data : new Buffer(data, options.encoding)
    , fileLength = new bigint(8, fileContent.length)
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
      ;
    
    function callback(offset){
      return function(err){
        if(stop) return;
        if(err) {
          cb && cb(err);
          stop = true;
        }
      }
      
      
    }
    
    fileContent.on('data', function(chunk){
      SMB2Request('write', {
        'FileId': file.FileId,
        'Offset': offset.toBuffer(),
        'Buffer': chunk
      }, connection, callback(offset));
      offset = offset.add(chunk.length);
      
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
