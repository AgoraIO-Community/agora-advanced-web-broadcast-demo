/**
 * Agora Audience Client 
 */

// create client 
var client = AgoraRTC.createClient({mode: 'live', codec: 'vp8'}); // vp8 to work across mobile devices

// stream references (keep track of active streams) 
var remoteStreams = {}; // remote streams obj struct [id : stream] 

// set log level:
// -- .DEBUG for dev 
// -- .NONE for prod
AgoraRTC.Logger.setLogLevel(AgoraRTC.Logger.DEBUG); 
$( document ).ready( function() {
  // Due to broswer restrictions on auto-playing video, 
  // user must click to init and join channel
  $("#watch-live-btn").click(function(){
    console.log("user clicked to watch broadcast")
    var agoraAppId = $('#form-appid').val(); // set app id
    var token = $('#form-token').val();
    var channelName = $('#form-channel').val(); // set channel name
    // init Agora SDK
    client.init(agoraAppId, function () {
      $("#watch-live-overlay").remove();
      console.log('AgoraRTC client initialized');
      joinChannel(token, channelName); // join channel upon successfull init
    }, function (err) {
      console.log('[ERROR] : AgoraRTC client init failed', err);
    });
  });
});

client.on('stream-published', function (evt) {
  console.log('Publish local stream successfully');
});

// connect remote streams
client.on('stream-added', function (evt) {
  var stream = evt.stream;
  var streamId = stream.getId();
  console.log("new stream added: " + streamId);
  // Subscribe to the stream.
  client.subscribe(stream, function (err) {
    console.log("[ERROR] : subscribe stream failed", err);
  });
  // Set the fallback option for each remote stream. 
  // - When the network condition is poor, set the client to receive audio only. 
  client.setStreamFallbackOption(stream, 2);
});

client.on('stream-subscribed', function (evt) {
  var remoteStream = evt.stream;
  var remoteId = remoteStream.getId();
  remoteStreams[remoteId] = remoteStream;
  console.log("Subscribe remote stream successfully: " + remoteId);
  if( $('#full-screen-video').is(':empty') ) { 
    mainStreamId = remoteId;
    remoteStream.play('full-screen-video');
  } else if (remoteId == 49024) {
    // move the current main stream to miniview
    remoteStreams[mainStreamId].stop(); // stop the main video stream playback
    client.setRemoteVideoStreamType(remoteStreams[mainStreamId], 1); // subscribe to the low stream
    addRemoteStreamMiniView(remoteStreams[mainStreamId]); // send the main video stream to a container
    // set the screen-share as the main 
    mainStreamId = remoteId;
    remoteStream.play('full-screen-video');s
  } else {
    client.setRemoteVideoStreamType(remoteStream, 1); // subscribe to the low stream
    addRemoteStreamMiniView(remoteStream);
  }
});

// remove the remote-container when a user leaves the channel
client.on("peer-leave", function(evt) {
  var streamId = evt.uid; // the the stream id
  if(remoteStreams[streamId] != undefined) {
    remoteStreams[streamId].stop(); // stop playing the feed
    delete remoteStreams[streamId]; // remove stream from list
    if (streamId == mainStreamId || streamId == 49024) {
      // swap out the video
      var streamIds = Object.keys(remoteStreams);
      if (streamIds.length > 0) {
        var randomId = streamIds[Math.floor(Math.random()*streamIds.length)]; // select from the remaining streams
        remoteStreams[randomId].stop(); // stop the stream's existing playback
        var remoteContainerID = '#' + randomId + '_container';
        $(remoteContainerID).empty().remove(); // remove the stream's miniView container
        remoteStreams[randomId].play('full-screen-video'); // play the random stream as the main stream
        mainStreamId = randomId; // set the new main remote stream 
      } else {
        $('#full-screen-video').empty()
      }
    } else {
      var remoteContainerID = '#' + streamId + '_container';
      $(remoteContainerID).empty().remove(); // 
    }
  }
});

// remove the remote-container when a user leaves the channel
client.on('peer-leave', function(evt) {
  console.log('Remote stream has left the channel: ' + evt.uid);
  evt.stream.stop(); // stop the stream
});

// show mute icon whenever a remote has muted their mic
client.on('mute-audio', function (evt) {
  var remoteId = evt.uid;
});

client.on('unmute-audio', function (evt) {
  var remoteId = evt.uid;
});

// show user icon whenever a remote has disabled their video
client.on('mute-video', function (evt) {
  var remoteId = evt.uid;
});

client.on('unmute-video', function (evt) {
  var remoteId = evt.uid;
});

// join a channel
function joinChannel(token, channelName) {
  // set the role
  client.setClientRole('audience', function() {
    console.log('Client role set to audience');
  }, function(e) {
    console.log('setClientRole failed', e);
  });
  
  client.join(token, channelName, 0, function(uid) {
      console.log('User ' + uid + ' join channel successfully');
  }, function(err) {
      console.log('[ERROR] : join channel failed', err);
  });
}

function leaveChannel() {
  client.leave(function() {
    console.log('client leaves channel');
  }, function(err) {
    console.log('client leave failed ', err); //error handling
  });
}

// use tokens for added security
function generateToken() {
  return null; // TODO: add a token generation
}


// REMOTE STREAMS UI
function addRemoteStreamMiniView(remoteStream){
  var streamId = remoteStream.getId();
  // append the remote stream template to #remote-streams
  $('#remote-streams').append(
    $('<div/>', {'id': streamId + '_container',  'class': 'remote-stream-container col'}).append(
      $('<div/>', {'id': streamId + '_mute', 'class': 'mute-overlay'}).append(
          $('<i/>', {'class': 'fas fa-microphone-slash'})
      ),
      $('<div/>', {'id': streamId + '_no-video', 'class': 'no-video-overlay text-center'}).append(
        $('<i/>', {'class': 'fas fa-user'})
      ),
      $('<div/>', {'id': 'agora_remote_' + streamId, 'class': 'remote-video'})
    )
  );
  remoteStream.play('agora_remote_' + streamId); 
  var containerId = '#' + streamId + '_container';
  var remoteMicBtnID = '#' + streamId +'-mic-btn';
  // play the miniview as fullscreen
  $(containerId).dblclick(function() {
    // play selected container as full screen - swap out current full screen stream
    remoteStreams[mainStreamId].stop(); // stop the main video stream playback
    addRemoteStreamMiniView(remoteStreams[mainStreamId]); // send the main video stream to a container
    client.setRemoteVideoStreamType(remoteStreams[mainStreamId], 1); // subscribe to the low stream
    $(containerId).empty().remove(); // remove the stream's miniView container
    remoteStreams[streamId].stop() // stop the container's video stream playback
    client.setRemoteVideoStreamType(remoteStreams[streamId], 0); // subscribe to the high stream
    remoteStreams[streamId].play('full-screen-video'); // play the remote stream as the full screen video
    mainStreamId = streamId; // set the container stream id as the new main stream id
  });
}