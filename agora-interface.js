/*
 * JS Interface with Agora.io SDK
 */

// video profile settings
var cameraVideoProfile = '720p_2'; // 640 × 480 @ 30fps  & 750kbs
var screenVideoProfile = '720p_2'; // 640 × 480 @ 30fps

// create client instances for camera (client) and screen share (screenClient)
var client = AgoraRTC.createClient({mode: 'live', codec: 'vp8'}); 
var screenClient = AgoraRTC.createClient({mode: 'live', codec: 'vp8'}); 

// stream references (keep track of active streams) 
var remoteStreams = {}; // remote streams obj struct [id : stream] 

var localStreams = {
  camera: {
    id: "",
    stream: {}
  },
  screen: {
    id: "",
    stream: {}
  }, 
  rtmActive: false
};

// keep track of devices
var devices = {
  cameras: [],
  mics: []
}

var statsIntervals = []; // references to intervals for getting in-call stats

var mainStreamId; // reference to main stream
var screenShareActive = false; // flag for screen share 

// setup the RTM client and channel
var rtmClient;
var rtmChannel; 

function initRTMClient(agoraAppId){
  rtmClient = AgoraRTM.createInstance(agoraAppId); 
  
  rtmClient.on('ConnectionStateChange', (newState, reason) => {
    console.log('on connection state changed to ' + newState + ' reason: ' + reason);
  });

  // event listener for receiving a peer-to-peer message.
  rtmClient.on('MessageFromPeer', ({ text }, peerId) => { 
    // text: text of the received message; peerId: User ID of the sender.
    console.log('AgoraRTM Peer Msg: from user ' + peerId + ' recieved: \n' + text);
    // message must parse to an object
    var msg = {};
    try {
      msg = JSON.parse(text);
    } catch (err) {
        if (err instanceof SyntaxError) {
            printError(e, true);
        } else {
            printError(err, false);
        }
        return;
    }
    // console.log(msg);
    // check if mute or leave command
    if ('mute' in msg) {
      console.log('Mute');
      toggleMic(localStreams.camera.stream);
    } else if ('leave' in msg) {
      console.log('Leave');
      leaveChannel();
    } else {
      console.log('[Warning] unknown message:');
      console.log(msg);
    }
  });
}

function initRTMChannel(channelName) {
  rtmChannel = rtmClient.createChannel(channelName); 

  // event listener for receiving a channel message
  rtmChannel.on('ChannelMessage', ({ text }, senderId) => { 
    // text: text of the received channel message; senderId: user ID of the sender.
    console.log('AgoraRTM Channel: msg from user ' + senderId + ' recieved: \n' + text);
    // convert from string to JSON
    const msg = JSON.parse(text); 
    // Handle RTM msg 
    
  });
}

function initClientAndJoinChannel(agoraAppId, token, channelName, uid) {
  // init Agora RTM SDK
  initRTMClient(agoraAppId);
  initRTMChannel(channelName);
  
  // init Agora RTC SDK
  client.init(agoraAppId, function () {
    console.log("AgoraRTC client initialized");
    joinChannel(channelName, uid, token); // join channel upon successfull init
    // connect RTM client to backend
    rtmClient.login({ token: null, uid: String(uid) }).then(() => {
      console.log('AgoraRTM client login success');
      localStreams.rtmActive = true
      joinRTMChannel(uid);      // join the RTM channel
    }).catch(err => {
      console.log('AgoraRTM client login failure', err);
    });
  }, function (err) {
    console.log("[ERROR] : AgoraRTC client init failed", err);
  });
}

client.on('stream-published', function (evt) {
  console.log("Publish local stream successfully");
});

// network
client.on('network-quality', function(stats) {
  setQualityDescriptors(stats.uplinkNetworkQuality, $('#uplink-quality-btn'), $('#uplink-quality-icon'))
  setQualityDescriptors(stats.downlinkNetworkQuality, $('#downlink-quality-btn'), $('#downlink-quality-icon'));
});

// connect remote streams
client.on('stream-added', function (evt) {
  var stream = evt.stream;
  var streamId = stream.getId();
  console.log("new stream added: " + streamId);
  // Check if the stream is local
  if (streamId != localStreams.screen.id) {
    console.log('subscribe to remote stream:' + streamId);
    // Subscribe to the stream.
    client.subscribe(stream, function (err) {
      console.log("[ERROR] : subscribe stream failed", err);
    });
    // Set the fallback option for each remote stream. 
    // - When the network condition is poor, set the client to receive audio only. 
    client.setStreamFallbackOption(stream, 2);
  }
});

client.on('stream-subscribed', function (evt) {
  var remoteStream = evt.stream;
  var remoteId = remoteStream.getId();
  remoteStreams[remoteId] = remoteStream;
  console.log("Subscribe remote stream successfully: " + remoteId);
  if( $('#full-screen-video').is(':empty') ) { 
    mainStreamId = remoteId;
    remoteStream.play('full-screen-video');
    $('#main-stats-btn').show();
    $('#main-stream-stats-btn').show();
    $('#remote-control-buttons-container').attr("style", "display:flex");
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
      // hide the stats popover
      var mainVideoStatsBtn = $('#main-stats-btn');
      if(mainVideoStatsBtn.data('bs.popover')) {
          mainVideoStatsBtn.popover('hide');
      }
      var mainVideoStatsBtn = $('#main-stream-stats-btn');
      if(mainVideoStatsBtn.data('bs.popover')) {
          mainVideoStatsBtn.popover('hide');
      }
      // swap out the video
      var streamIds = Object.keys(remoteStreams);
      if (streamIds.length > 0) {
        var randomId = streamIds[Math.floor(Math.random()*streamIds.length)]; // select from the remaining streams
        remoteStreams[randomId].stop(); // stop the stream's existing playback
        var remoteMicBtnID = '#' + streamId +'-mic-btn';
        // check if new stream is unmuted
        if($(remoteMicBtnID).hasClass('btn-dark') ){
          $("#remote-mic-btn").removeClass('btn-danger').addClass('btn-dark');
          $("#remote-mic-icon").removeClass('fa-microphone-slash').addClass('fa-microphone');
        }
        // reset the direct controls
        $("#remote-direct-audio-btn").removeClass('btn-success').addClass('btn-dark');
        var remoteContainerID = '#' + randomId + '_container';
        $(remoteContainerID).empty().remove(); // remove the stream's miniView container
        remoteStreams[randomId].play('full-screen-video'); // play the random stream as the main stream
        mainStreamId = randomId; // set the new main remote stream 
      } else {
        $('#main-stats-btn').hide();
        $('#main-stream-stats-btn').hide();
        $('#remote-control-buttons-container').attr("style", "display:none");
        // reset the fullscreen controls
        $("#remote-mic-btn").removeClass('btn-danger').addClass('btn-dark');
        $("#remote-mic-icon").removeClass('fa-microphone-slash').addClass('fa-microphone');
        $("#remote-direct-audio-btn").removeClass('btn-success').addClass('btn-dark');
      }
    } else {
      // close the pop-over
      var remoteVideoStatsBtn = $('#'+ streamId +'-stats-btn');
      if(remoteVideoStatsBtn.data('bs.popover')) {
          remoteVideoStatsBtn.popover('hide');
      }
      var remoteContainerID = '#' + streamId + '_container';
      $(remoteContainerID).empty().remove(); // 
    }
  }
});

// show mute icon whenever a remote has muted their mic
client.on("mute-audio", function (evt) {
  var remoteUID = evt.uid
  if (mainStreamId == remoteUID) {
    toggleRemoteMic('#remote-mic-btn', '#remote-mic-icon');
  } else {
    var micBtnID = '#' + remoteUID +'-mic-btn';
    var micIconID = '#' + remoteUID +'-mic-icon';
    toggleRemoteMic(micBtnID, micIconID);
  }
  
});

client.on("unmute-audio", function (evt) {
  var remoteUID = evt.uid
  if (mainStreamId == remoteUID) {
    toggleRemoteMic('#remote-mic-btn', '#remote-mic-icon');
  } else {
    var micBtnID = '#' + remoteUID +'-mic-btn';
    var micIconID = '#' + remoteUID +'-mic-icon';
    toggleRemoteMic(micBtnID, micIconID);
  }
});

// show user icon whenever a remote has disabled their video
client.on("mute-video", function (evt) {
  var remoteId = evt.uid;
  // if the main user stops their video select a random user from the list
  if (remoteId != mainStreamId) {
    // if not the main vidiel then show the user icon
    toggleVisibility('#' + remoteId + '_no-video', true);
  }
});

client.on("unmute-video", function (evt) {
  toggleVisibility('#' + evt.uid + '_no-video', false);
});

// Stream Fallback listeners
client.on("stream-fallback", function (evt) {
  console.log(evt);
});

client.on("stream-type-changed", function (evt) {
  console.log(evt);
});

// join a channel
function joinChannel(channelName, uid, token) {
  client.join(token, channelName, uid, function(uid) {
      console.log("User " + uid + " join channel successfully");
      createCameraStream(uid);
      localStreams.camera.id = uid; // keep track of the stream uid 
  }, function(err) {
      console.log("[ERROR] : join channel failed", err);
  });
}

// video streams for channel
function createCameraStream(uid) {
  var localStream = AgoraRTC.createStream({
    streamID: uid,
    audio: true,
    video: true,
    screen: false
  });
  localStream.setVideoProfile(cameraVideoProfile);

  // add stream callbacks 
  // The user has granted access to the camera and mic.
  localStream.on("accessAllowed", function() {
    if(devices.cameras.length === 0 && devices.mics.length === 0) {
      console.log('[DEBUG] : checking for cameras & mics');
      getCameraDevices();
      getMicDevices();
    }
    console.log("accessAllowed");
  });
  // The user has denied access to the camera and mic.
  localStream.on("accessDenied", function() {
    console.log("accessDenied");
  });

  // initialize the stream
  localStream.init(function() {
    console.log("getUserMedia successfully");
    // TODO: add check for other streams. play local stream full size if alone in channel
    localStream.play('local-video'); // play the given stream within the local-video div

    // Enable dual-stream mode for the sender.
    client.enableDualStream(function () {
      console.log("Enable dual stream success!");
    }, function (err) {
      console.log(err);
    });

    // set the lowstream profile settings
    var lowVideoStreamProfile = {
      bitrate: 200,
      framerate: 15,
      height: 240,
      width: 320
    }
    client.setLowStreamParameter(lowVideoStreamProfile);

    // publish local stream
    client.publish(localStream, function (err) {
      console.log("[ERROR] : publish local stream error: " + err);
    });
  
    enableUiControls(localStream); // move after testing
    localStreams.camera.stream = localStream; // keep track of the camera stream for later
  }, function (err) {
    console.log("[ERROR] : getUserMedia failed", err);
  });
}

// SCREEN SHARING
function initScreenShare(agoraAppId, channelName) {
  console.log("AgoraRTC screenClient initialized");
  var uid = 49024; // using an explicit uid to make it easier to track across clients
  screenClient = AgoraRTC.createClient({mode: 'rtc', codec: 'vp8'}); 
  screenClient.init(agoraAppId, function () {
    console.log("AgoraRTC screenClient initialized");
  }, function (err) {
    console.log("[ERROR] : AgoraRTC screenClient init failed", err);
  });
  // keep track of the uid of the screen stream. 
  localStreams.screen.id = uid;  
  
  // Create the stream for screen sharing.
  var screenStream = AgoraRTC.createStream({
    streamID: uid,
    audio: false, // Set the audio attribute as false to avoid any echo during the call.
    video: false,
    screen: true, // screen stream
    screenAudio: true,
    mediaSource:  'screen', // Firefox: 'screen', 'application', 'window' (select one)
  });
  // initialize the stream 
  // -- NOTE: this must happen directly from user interaction, if called by a promise or callback it will fail.
  screenStream.init(function(){
    console.log("getScreen successful");
    localStreams.screen.stream = screenStream; // keep track of the screen stream
    screenShareActive = true;
    $("#screen-share-btn").prop("disabled",false); // enable button
    screenClient.join(token, channelName, uid, function(uid) { 
      screenClient.publish(screenStream, function (err) {
        console.log("[ERROR] : publish screen stream error: " + err);
      });
    }, function(err) {
      console.log("[ERROR] : join channel as screen-share failed", err);
    });
  }, function (err) {
    console.log("[ERROR] : getScreen failed", err);
    localStreams.screen.id = ""; // reset screen stream id
    localStreams.screen.stream = {}; // reset the screen stream
    screenShareActive = false; // resest screenShare
    toggleScreenShareBtn(); // toggle the button icon back
    $("#screen-share-btn").prop("disabled",false); // enable button
  });
  var token = generateToken();
  screenClient.on('stream-published', function (evt) {
    console.log("Publish screen stream successfully");
    
    if( $('#full-screen-video').is(':empty') ) { 
      $('#main-stats-btn').show();
      $('#main-stream-stats-btn').show();
    } else {
      // move the current main stream to miniview
      remoteStreams[mainStreamId].stop(); // stop the main video stream playback
      client.setRemoteVideoStreamType(remoteStreams[mainStreamId], 1); // subscribe to the low stream
      addRemoteStreamMiniView(remoteStreams[mainStreamId]); // send the main video stream to a container
    }

    mainStreamId = localStreams.screen.id;
    localStreams.screen.stream.play('full-screen-video');
  });
  
  screenClient.on('stopScreenSharing', function (evt) {
    console.log("screen sharing stopped", err);
  }); 
}

function stopScreenShare() {
  localStreams.screen.stream.disableVideo(); // disable the local video stream (will send a mute signal)
  localStreams.screen.stream.stop(); // stop playing the local stream
  localStreams.camera.stream.enableVideo(); // enable the camera feed
  localStreams.camera.stream.play('local-video'); // play the camera within the full-screen-video div
  $("#video-btn").prop("disabled",false);
  screenClient.leave(function() {
    screenShareActive = false; 
    console.log("screen client leaves channel");
    $("#screen-share-btn").prop("disabled",false); // enable button
    screenClient.unpublish(localStreams.screen.stream); // unpublish the screen client
    localStreams.screen.stream.close(); // close the screen client stream
    localStreams.screen.id = ""; // reset the screen id
    localStreams.screen.stream = {}; // reset the stream obj
  }, function(err) {
    console.log("client leave failed ", err); //error handling
  }); 
}

// REMOTE STREAMS UI
function addRemoteStreamMiniView(remoteStream){
  var streamId = remoteStream.getId();
  // append the remote stream template to #remote-streams
  $('#remote-streams').append(
    $('<div/>', { 'id': streamId + '_container', 'class': 'remote-stream-container col' }).append(
      $('<div/>', { 'id': streamId + '-buttons-container', 'class': 'remote-control-buttons-container row justify-content-center ms-1',}).append(
        $('<div/>', { 'class': 'col-md-2 p-1 text-center',}).append(
          $('<button/>', {
                          'id': streamId +'-mic-btn', 
                          'type': 'button', 
                          'class': 'btn btn-block btn-dark btn-sm',
            }).append(
              $('<i/>', {'id': streamId +'-mic-icon', 'class': 'fas fa-microphone'})
          ),
        ),
        $('<div/>', { 'class': 'col-md-2 p-1 text-center',}).append(
          $('<button/>', {
                          'id': streamId +'-exit-btn', 
                          'type': 'button', 
                          'class': 'btn btn-block btn-danger btn-sm',
            }).append(
              $('<i/>', {'id': streamId +'-exit-icon', 'class': 'fas fa-phone-slash'})
          ),
        ),
      ),
      $('<div/>', { 'id': streamId + '_no-video', 'class': 'no-video-overlay text-center',}).append(
          $('<i/>', {'class': 'fas fa-user'})
        ),
      $('<div/>', { 'id': streamId + '-stats-container', 'class': 'stats-btn-container remote-stats-container col-2 float-right text-right p-0 m-0',}).append(
          $('<button/>', {
                          'id': streamId +'-stream-stats-btn', 
                          'type': 'button', 
                          'class': 'btn btn-lg p-0 m-1',
                          'data-toggle': 'popover',
                          'data-placement': 'top',
                          'data-html': true,
                          'title': 'Stream Stats',
                          'data-content': 'loading stats...'
            }).append(
              $('<i/>', {'id': streamId +'-stream-stats-icon', 'class': 'fas fa-signal', 'style':'color:#fff'})
          ),
          $('<button/>', {
                          'id': streamId +'-stats-btn', 
                          'type': 'button', 
                          'class': 'btn btn-lg  p-0 m-1',
                          'data-toggle': 'popover',
                          'data-placement': 'top',
                          'data-html': true,
                          'title': 'Video Stats',
                          'data-content': 'loading stats...'
            }).append(
              $('<i/>', {'class': 'fas fa-info-circle', 'style':'color:#fff'})
          )
        ),
      $('<div/>', {'id': 'agora_remote_' + streamId, 'class': 'remote-video'})
    )
  );
  remoteStream.play('agora_remote_' + streamId); 
  var containerId = '#' + streamId + '_container';
  var remoteMicBtnID = '#' + streamId +'-mic-btn';
  // play the miniview as fullscreen
  $(containerId).dblclick(function() {
    // check if current stream is muted
    var origMainIsmuted = false;
    if($("#remote-mic-btn").hasClass('btn-danger') ){
      console.log('origMainIsmuted');
      origMainIsmuted = true
    }
    // check if current stream is unmuted
    if($(remoteMicBtnID).hasClass('btn-dark') ){
      $("#remote-mic-btn").removeClass('btn-danger').addClass('btn-dark');
      $("#remote-mic-icon").removeClass('fa-microphone-slash').addClass('fa-microphone');
    } else {
      $("#remote-mic-btn").addClass('btn-danger').removeClass('btn-dark');
      $("#remote-mic-icon").addClass('fa-microphone-slash').removeClass('fa-microphone');
    }
    // play selected container as full screen - swap out current full screen stream
    remoteStreams[mainStreamId].stop(); // stop the main video stream playback
    addRemoteStreamMiniView(remoteStreams[mainStreamId]); // send the main video stream to a container
    client.setRemoteVideoStreamType(remoteStreams[mainStreamId], 1); // subscribe to the low stream
    $(containerId).empty().remove(); // remove the stream's miniView container
    remoteStreams[streamId].stop() // stop the container's video stream playback

    if(origMainIsmuted){
      console.log('mute remote');
      var micBtnID = '#' + mainStreamId +'-mic-btn';
      var micIconID = '#' + mainStreamId +'-mic-icon';
      $(micBtnID).addClass('btn-danger').removeClass('btn-dark');
      $(micIconID).addClass('fa-microphone-slash').removeClass('fa-microphone');
    }

    client.setRemoteVideoStreamType(remoteStreams[streamId], 0); // subscribe to the high stream
    remoteStreams[streamId].play('full-screen-video'); // play the remote stream as the full screen video
    mainStreamId = streamId; // set the container stream id as the new main stream id
  });
  // toggle remote mic
  $(remoteMicBtnID).click(function() {
    if($(remoteMicBtnID).hasClass('btn-dark') ){
      // send message to mute remote user
      var msg = { mute: true };
      sendP2PMessage(streamId, msg).then(sendResult => {
        if (sendResult.hasPeerReceived) {
          /* Handle the event that the remote user receives the message. */
        } else {
          /* Handle the event that the message is received by the server but the remote user cannot be reached. */
        }
      }).catch(error => { 
        /* Handle the event of a message send failure. */
        console.log(error)  
      });
    } else {
      // send message to unmute
      var msg = { mute: false };
      sendP2PMessage(streamId, msg).then(sendResult => {
        if (sendResult.hasPeerReceived) {
          /* Handle the event that the remote user receives the message. */
        } else {
          /* Handle the event that the message is received by the server but the remote user cannot be reached. */
        }
      }).catch(error => { 
        /* Handle the event of a message send failure. */
        console.log(error)  
      });
    }
  });
  // remove remote user from channel
  var remoteExitBtnID = '#' + streamId +'-exit-btn';
  $(remoteExitBtnID).click(function() {
    // send message to mute remote user
    var msg = { leave: true };
    sendP2PMessage(streamId, msg).then(sendResult => {
      if (sendResult.hasPeerReceived) {
        /* Handle the event that the remote user receives the message. */
      } else {
        /* Handle the event that the message is received by the server but the remote user cannot be reached. */
      }
    }).catch(error => { 
      /* Handle the event of a message send failure. */
      console.log(error)  
    });
  });
}

function leaveChannel() {
  
  if(screenShareActive) {
    stopScreenShare();
  }

  // disable stats interval
  disableStats();

  client.leave(function() {
    console.log("client leaves channel");
    localStreams.camera.stream.stop() // stop the camera stream playback
    client.unpublish(localStreams.camera.stream); // unpublish the camera stream
    localStreams.camera.stream.close(); // clean up and close the camera stream
    $("#remote-streams").empty() // clean up the remote feeds
    $("#full-screen-video").empty() // clean up the remote feeds
    $('#remote-control-buttons-container').attr("style", "display:none");
    //disable/reset the UI elements
    $("#mic-btn").prop("disabled", true).removeClass('btn-danger').addClass('btn-dark').unbind('click');
    $("#mic-icon").removeClass('fa-microphone-slash').addClass('fa-microphone');
    $("#mic-dropdown").prop("disabled", true).removeClass('btn-danger').addClass('btn-dark');
    $("#video-btn").prop("disabled", true).removeClass('btn-danger').addClass('btn-dark').unbind('click');
    $("#video-icon").removeClass('fa-video-slash').addClass('fa-video');
    $("#cam-dropdown").prop("disabled", true).removeClass('btn-danger').addClass('btn-dark');
    $("#screen-share-btn").prop("disabled", true).unbind('click');
    $("#exit-btn").prop("disabled", true).unbind('click');
    $("#toggle-stats-btn").prop("disabled", true).unbind('click');
    $(document).unbind("keypress");
    // reset the fullscreen controls
    $("#remote-mic-btn").removeClass('btn-danger').addClass('btn-dark').unbind('click');
    $("#remote-mic-icon").removeClass('fa-microphone-slash').addClass('fa-microphone');
    $("#remote-direct-audio-btn").removeClass('btn-success').addClass('btn-dark').unbind('click');
    $("#remote-exit-btn").unbind('click');
    // hide the mute/no-video overlays
    // toggleVisibility("#mute-overlay", false); 
    toggleVisibility("#no-local-video", false);
    // show the modal overlay to join
    $("#modalForm").modal("show");
  }, function(err) {
    console.log("client leave failed ", err); //error handling
  });
  rtmChannel.leave().then(() => {
    // leave-channel success
    console.log('RTM Channel leave success');
  }).catch(error => {
    // join-channel failure
    console.log('failed to leave channel with error: ' +  error);
  });
  // log out of RTM
  rtmClient.logout().then(() => {
    // leave-channel success
    console.log('RTM logout success');
  }).catch(error => {
    // join-channel failure
    console.log('failed to logout with error: ' +  error);
  });
}

// use tokens for added security
function generateToken() {
  return null; // TODO: add a token generation
}


// switch device
function changeStreamSource (deviceIndex, deviceType) {
  console.log('Switching stream sources for: ' + deviceType);
  var deviceId;
  var existingStream = false;
  
  if (deviceType === "video") {
    deviceId = devices.cameras[deviceIndex].deviceId
  }

  if(deviceType === "audio") {
    deviceId = devices.mics[deviceIndex].deviceId;
  }

  localStreams.camera.stream.switchDevice(deviceType, deviceId, function(){
    console.log('successfully switched to new device with id: ' + JSON.stringify(deviceId));
    // set the active device ids
    if(deviceType === "audio") {
      localStreams.camera.micId = deviceId;
    } else if (deviceType === "video") {
      localStreams.camera.camId = deviceId;
      localStreams.camera.stream.setVideoProfile(cameraVideoProfile);
    } else {
      console.log("unable to determine deviceType: " + deviceType);
    }
  }, function(){
    console.log('failed to switch to new device with id: ' + JSON.stringify(deviceId));
  });
}

// get devices
function getCameraDevices() {
  console.log("Checking for Camera Devices.....")
  client.getCameras (function(cameras) {
    devices.cameras = cameras; // store cameras array
    cameras.forEach(function(camera, i){
      var name = camera.label.split('(')[0];
      var optionId = 'camera_' + i;
      var deviceId = camera.deviceId;
      if(i === 0 && localStreams.camera.camId === ''){
        localStreams.camera.camId = deviceId;
      }
      $('#camera-list').append('<a class="dropdown-item" id="' + optionId + '">' + name + '</a>');
    });
    $('#camera-list a').click(function(event) {
      var index = event.target.id.split('_')[1];
      changeStreamSource (index, "video");
    });
  });
}

function getMicDevices() {
  console.log("Checking for Mic Devices.....")
  client.getRecordingDevices(function(mics) {
    devices.mics = mics; // store mics array
    mics.forEach(function(mic, i){
      var name = mic.label.split('(')[0];
      var optionId = 'mic_' + i;
      var deviceId = mic.deviceId;
      if(i === 0 && localStreams.camera.micId === ''){
        localStreams.camera.micId = deviceId;
      }
      if(name.split('Default - ')[1] != undefined) {
        name = '[Default Device]' // rename the default mic - only appears on Chrome & Opera
      }
      $('#mic-list').append('<a class="dropdown-item" id="' + optionId + '">' + name + '</a>');
    }); 
    $('#mic-list a').click(function(event) {
      var index = event.target.id.split('_')[1];
      changeStreamSource (index, "audio");
    });
  });
}

// stats
function hideStatsPopovers() {
  // add the static pop-over btns first
  var statsBtns = [
    $('#main-stats-btn'), 
    $('#main-stream-stats-btn'),
    $('#main-audio-stats-btn'),
    $('#main-video-stats-btn'),
    $('#stream-stats-btn'), 
    $('#network-stats-btn'),
    $('#session-stats-btn'),
    $('#audio-stats-btn'),
    $('#video-stats-btn'),
  ]

  // loop through remote streams and add dynamic popover btns
  var streamIds = Object.keys(remoteStreams);
  if (streamIds.length > 0) {
    streamIds.forEach(function (streamId) {
      var remoteStatbtn = $('#' + streamId +'-stats-btn')
      if(remoteStatbtn)[
        statsBtns.push(remoteStatbtn)
      ]
    })
  }

  // hide all pop-overs
  statsBtns.forEach(function(statBtn){
    if(statBtn.data('bs.popover')) {
      statBtn.popover('hide');
    }
  })
}

function joinRTMChannel(){
  rtmChannel.join().then(() => {
    // join-channel success
    console.log('RTM Channel join success');
  }).catch(error => {
    // join-channel failure
    console.log('failed to join channel with error: ' +  error);
  });
}

function sendChannelMessage(channelMsg){
  if (localStreams.rtmActive) {
    // use a JSON object to send our instructions in a structured way
    const jsonMsg = {
      action: action,
      direction: direction
    };
    // build the Agora RTM Message
    const msg = { 
      description: undefined,
      messageType: 'TEXT',
      rawMessage: undefined,
      text: JSON.stringify(jsonMsg) 
    }; 

    rtmChannel.sendMessage(msg).then(() => {
      // channel message-send success
      console.log('sent msg success');
    }).catch(error => {
    // channel message-send failure
    console.log('sent msg failure');
    });
  }
}

function sendP2PMessage(recipientUID, peerMsg) {
  // An RtmMessage object.
  remoteUID = String(recipientUID);
  const msg = { 
    description: undefined,
    messageType: 'TEXT',
    rawMessage: undefined,
    text: JSON.stringify(peerMsg)
  } 
  const options = { enableHistoricalMessaging: false, enableOfflineMessaging: false }
  // p2p message
  return rtmClient.sendMessageToPeer(msg,remoteUID, options);
}

function enableStats() {
  if (statsIntervals.localStreamStatsInterval != null) {
    console.log('stats have already been enabled');
    return;
  }
  console.log('enable stats');
  // local stream stats
  var localStreamStatsBtn = $('#stream-stats-btn');
  var localStreamStatsInterval = setInterval(() => {
    localStreams.camera.stream.getStats((stats) => {
      var networkQuality;
      var networkIcon = $('#connection-quality-icon');
      if (stats.accessDelay < 100){
        networkQuality = "Good"
        networkIcon.css( "color", "green" );
      } else if (stats.accessDelay < 200){
        networkQuality = "Poor"
        networkIcon.css( "color", "orange" );
      } else if (stats.accessDelay >= 200){
        networkQuality = "Bad"
        networkIcon.css( "color", "red" );
      } else {
        networkQuality = "-"
        networkIcon.css( "color", "black" );
      }
      if(localStreamStatsBtn.data('bs.popover') && localStreamStatsBtn.attr('aria-describedby')) {
        var localStreamStats = `<strong>Access Delay:</strong> ${stats.accessDelay}<br/>
                                <strong>Network Quality:</strong> ${networkQuality}<br/> 
                                <strong>Audio Send Bytes:</strong> ${stats.audioSendBytes}<br/>
                                <strong>Audio Send Packets:</strong> ${stats.audioSendPackets}<br/>
                                <strong>Audio Send Packets Lost:</strong> ${stats.audioSendPacketsLost}<br/>
                                <strong>Video Send Bytes:</strong> ${stats.videoSendBytes}<br/>
                                <strong>Video Send Frame Rate:</strong> ${stats.videoSendFrameRate} fps<br/>
                                <strong>Video Send Packets:</strong> ${stats.videoSendPackets}<br/>
                                <strong>Video Send Packets Lost:</strong> ${stats.videoSendPacketsLost}<br/>
                                <strong>Video Send Resolution Heigh:</strong> ${stats.videoSendResolutionHeight}px<br/>  
                                <strong>Video Send Resolution Width:</strong> ${stats.videoSendResolutionWidth}px
                              `;
      localStreamStatsBtn.data('bs.popover').element.dataset.content = localStreamStats;
      localStreamStatsBtn.data('bs.popover').setContent();
      localStreamStatsBtn.popover('update');
      }

    });
  }, 1000);                        
  statsIntervals.localStreamStatsInterval = localStreamStatsInterval;

  // network
  var networkStatsBtn = $('#network-stats-btn');
  var networkInterval = setInterval(() => {
    if(networkStatsBtn.data('bs.popover') && networkStatsBtn.attr('aria-describedby')) {
      client.getTransportStats((stats) => {
        var networkStats = `<strong>Round-Trip Time:</strong> ${stats.RTT}<br/>
                            <strong>Network Type:</strong> ${stats.networkType}<br/>
                            <strong>Outgoing Available Bandwidth:</strong> ${stats.OutgoingAvailableBandwidth}
                          `;
        networkStatsBtn.data('bs.popover').element.dataset.content = networkStats;
        networkStatsBtn.data('bs.popover').setContent();
        networkStatsBtn.popover('update');
      });
    }
  }, 1000);                        
  statsIntervals.network = networkInterval;

  // session
  var sessionStatsBtn = $('#session-stats-btn');
  var sessionInterval = setInterval(() => {
    if(sessionStatsBtn.data('bs.popover') && sessionStatsBtn.attr('aria-describedby')) {
      client.getSessionStats((stats) => {
          var sessionStats = `<strong>Duration:</strong> ${stats.Duration}s<br/>
                              <strong>User Count:</strong> ${stats.UserCount}<br/>
                              <strong>Sent Bytes:</strong> ${stats.SendBytes}<br/>
                              <strong>Recv Bytes:</strong> ${stats.RecvBytes}<br/>
                              <strong>Send Bitrate:</strong> ${stats.SendBitrate} Kbps<br/>
                              <strong>Recv Bitrate:</strong> ${stats.RecvBitrate} Kbps
                            `;
          sessionStatsBtn.data('bs.popover').element.dataset.content = sessionStats;
          sessionStatsBtn.data('bs.popover').setContent();
          sessionStatsBtn.popover('update');
      });
    }
  }, 1000);
  statsIntervals.session = sessionInterval;

  // local audio
  var localAudioStatsBtn = $('#audio-stats-btn');
  var localAudioInterval = setInterval(() => {
    localAudioStatsBtn.show();
    if(localAudioStatsBtn.data('bs.popover') && localAudioStatsBtn.attr('aria-describedby')) {
      client.getLocalAudioStats((localAudioStats) => {
        for(var uid in localAudioStats){
          if(uid == localStreams.camera.id) {
            var audioStats = `<strong>Codec Type:</strong> ${localAudioStats[uid].CodecType}<br/>
                              <strong>Mute State:</strong> ${localAudioStats[uid].MuteState}<br/>
                              <strong>Recording Level:</strong> ${localAudioStats[uid].RecordingLevel}<br/>
                              <strong>Sampling Rate:</strong> ${localAudioStats[uid].SamplingRate} kHz<br/>
                              <strong>Send Bitrate:</strong> ${localAudioStats[uid].SendBitrate} Kbps<br/>
                              <strong>SendLevel:</strong> ${localAudioStats[uid].SendLevel} 
                            `;
            localAudioStatsBtn.data('bs.popover').element.dataset.content = audioStats;
            localAudioStatsBtn.data('bs.popover').setContent();
            localAudioStatsBtn.popover('update');
          }
        }
      });
    }
  }, 1000);
  statsIntervals.localAudio = localAudioInterval;

  // local video
  var localVideoStatsBtn = $('#video-stats-btn');
  var localVideoInterval = setInterval(() => {
    localVideoStatsBtn.show();
    if(localVideoStatsBtn.data('bs.popover')&& localVideoStatsBtn.attr('aria-describedby')) {
      client.getLocalVideoStats((localVideoStats) => {
        for(var uid in localVideoStats){
          if(uid == localStreams.camera.id) {
            var videoStats = `<strong>Capture Frame Rate:</strong> ${localVideoStats[uid].CaptureFrameRate} fps<br/>
                              <strong>Capture Resolution Height:</strong> ${localVideoStats[uid].CaptureResolutionHeight}px<br/>
                              <strong>Capture Resolution Width:</strong> ${localVideoStats[uid].CaptureResolutionWidth}px<br/>
                              <strong>Encode Delay:</strong> ${localVideoStats[uid].EncodeDelay}ms<br/>
                              <strong>Mute State:</strong> ${localVideoStats[uid].MuteState}<br/>
                              <strong>Send Bitrate:</strong> ${localVideoStats[uid].SendBitrate} Kbps<br/>
                              <strong>Send Frame Rate:</strong> ${localVideoStats[uid].SendFrameRate} fps<br/>
                              <strong>Send Resolution Heigh:</strong> ${localVideoStats[uid].SendResolutionHeight}px<br/>  
                              <strong>Send Resolution Width:</strong> ${localVideoStats[uid].SendResolutionWidth}px<br/>
                              <strong>Target Send Bitrate:</strong> ${localVideoStats[uid].TargetSendBitrate} Kbps<br/>
                              <strong>Total Duration:</strong> ${localVideoStats[uid].TotalDuration}s<br/>
                              <strong>Total Freeze Time:</strong> ${localVideoStats[uid].TotalFreezeTime}s 
                            `;
            localVideoStatsBtn.data('bs.popover').element.dataset.content = videoStats;
            localVideoStatsBtn.data('bs.popover').setContent();
            localVideoStatsBtn.popover('update');
          }
        }
      });
    }

  }, 1000);
  statsIntervals.localVideo = localVideoInterval;

  // remote audio
  var remoteAudioInterval = setInterval(() => {
    client.getRemoteVideoStats((remoteAudioStatsMap) => {
      for(var uid in remoteAudioStatsMap){
        var remoteAudioStatsBtn;
        if(uid == mainStreamId){
          remoteAudioStatsBtn = $('#main-audio-stats-btn');
        } else {
          remoteAudioStatsBtn = $('#'+ uid +'-stats-btn');
        }
        if(remoteAudioStatsBtn.data('bs.popover')&& remoteAudioStatsBtn.attr('aria-describedby')) {
          var videoStats = `<strong>CodecType:</strong> ${remoteAudioStatsMap[uid].CodecType}<br/>
                            <strong>End 2 End Delay:</strong> ${remoteAudioStatsMap[uid].End2EndDelay}ms<br/>
                            <strong>Mute State:</strong> ${remoteAudioStatsMap[uid].MuteState}<br/>
                            <strong>Packet Loss Rate:</strong> ${remoteAudioStatsMap[uid].PacketLossRate}%<br/>
                            <strong>Recv Bitrate:</strong> ${remoteAudioStatsMap[uid].RecvBitrate} Kbps<br/>
                            <strong>Recv Level:</strong> ${remoteAudioStatsMap[uid].RecvLevel}px<br/>
                            <strong>Total Freeze Time:</strong> ${remoteAudioStatsMap[uid].TotalFreezeTime}s<br/>
                            <strong>Total Play Duration:</strong> ${remoteAudioStatsMap[uid].TotalPlayDuration}s<br/>
                            <strong>Transport Delay:</strong> ${remoteAudioStatsMap[uid].TransportDelay}ms
                            `;
            remoteAudioStatsBtn.data('bs.popover').element.dataset.content = videoStats;
            remoteAudioStatsBtn.data('bs.popover').setContent();
            remoteAudioStatsBtn.popover('update');
        }
      }
    });
  }, 1000);
  statsIntervals.remoteAudio = remoteAudioInterval;

  // remote video
  var remoteVideoInterval = setInterval(() => {
    client.getRemoteVideoStats((remoteVideoStatsMap) => {
      for(var uid in remoteVideoStatsMap){
        var remoteVideoStatsBtn;
        if(uid == mainStreamId){
          remoteVideoStatsBtn = $('#main-video-stats-btn');
        } else {
          remoteVideoStatsBtn = $('#'+ uid +'-stats-btn');
        }
        if(remoteVideoStatsBtn.data('bs.popover')&& remoteVideoStatsBtn.attr('aria-describedby')) {
          var videoStats = `<strong>End 2 End Delay:</strong> ${remoteVideoStatsMap[uid].End2EndDelay}ms<br/>
                            <strong>Mute State:</strong> ${remoteVideoStatsMap[uid].MuteState}<br/>
                            <strong>Packet Loss Rate:</strong> ${remoteVideoStatsMap[uid].PacketLossRate}%<br/>
                            <strong>Recv Bitrate:</strong> ${remoteVideoStatsMap[uid].RecvBitrate} Kbps<br/>
                            <strong>Recv Resolution Height:</strong> ${remoteVideoStatsMap[uid].RecvResolutionHeight}px<br/>
                            <strong>Recv Resolution Width:</strong> ${remoteVideoStatsMap[uid].RecvResolutionWidth}px<br/>
                            <strong>Render Frame Rate:</strong> ${remoteVideoStatsMap[uid].RenderFrameRate} fps<br/>
                            <strong>Render Resolution Heigh:</strong> ${remoteVideoStatsMap[uid].RenderResolutionHeight}px<br/>  
                            <strong>Render Resolution Width:</strong> ${remoteVideoStatsMap[uid].RenderResolutionWidth}px<br/>
                            <strong>Total Freeze Time:</strong> ${remoteVideoStatsMap[uid].TotalFreezeTime}s<br/>
                            <strong>Total Play Duration:</strong> ${remoteVideoStatsMap[uid].TotalPlayDuration}s<br/>
                            <strong>Transport Delay:</strong> ${remoteVideoStatsMap[uid].TransportDelay}ms
                            `;
            remoteVideoStatsBtn.data('bs.popover').element.dataset.content = videoStats;
            remoteVideoStatsBtn.data('bs.popover').setContent();
            remoteVideoStatsBtn.popover('update');
        }
      }
    });
  }, 1000);
  statsIntervals.remoteVideo = remoteVideoInterval;
  
  // remote stream 
  var remoteStreamInterval = setInterval(() => {
    for(var uid in remoteStreams){
      var remoteStreamStatsBtn;
      var remoteNetworkIcon;
      if(uid == mainStreamId){
        remoteStreamStatsBtn = $('#main-stream-stats-btn');
        remoteNetworkIcon = $('#main-stream-stats-icon'); 
      } else {
        remoteStreamStatsBtn = $('#'+ uid + '-stream-stats-btn');
        remoteNetworkIcon = $('#'+ uid + '-stream-stats-icon'); 
      }
      // console.log('get stats for uid: ' + uid);
      remoteStreams[uid].getStats(function (stats) {
        // console.log('-- stats for uid: ' + uid);
        // console.log(stats);
        var networkQuality;
        // update network icon color
        if (stats.accessDelay < 100){
          networkQuality = "Good"
          remoteNetworkIcon.css( "color", "green" );
        } else if (stats.accessDelay < 200){
          networkQuality = "Poor"
          remoteNetworkIcon.css( "color", "orange" );
        } else if (stats.accessDelay >= 200){
          networkQuality = "Bad"
          remoteNetworkIcon.css( "color", "red" );
        } else {
          networkQuality = "-"
          remoteNetworkIcon.css( "color", "white" );
        }

        // update tool-tip
        if(remoteStreamStatsBtn.data('bs.popover')&& remoteStreamStatsBtn.attr('aria-describedby')) {
          var remoteStreamStats = `<strong>Access Delay:</strong> ${stats.accessDelay}<br/>
                                  <strong>Network Quality:</strong> ${networkQuality}<br/> 
                                  <strong>Audio Receive Bytes:</strong> ${stats.audioReceiveBytes}<br/>
                                  <strong>Audio Receive Delay:</strong> ${stats.audioReceiveDelay}<br/>
                                  <strong>Audio Receive Packets:</strong> ${stats.audioReceivePackets}<br/>
                                  <strong>Audio Receive Packets Lost:</strong> ${stats.audioReceivePacketsLost}<br/>
                                  <strong>End To End Delay:</strong> ${stats.endToEndDelay}<br/>
                                  <strong>Video Receive Bytes:</strong> ${stats.videoReceiveBytes}<br/>
                                  <strong>Video Decode Frame Rate:</strong> ${stats.videoReceiveDecodeFrameRate} fps<br/>
                                  <strong>Video Receive Delay:</strong> ${stats.videoReceiveDelay}<br/>
                                  <strong>Video Receive Frame Rate:</strong> ${stats.videoReceiveFrameRate} fps<br/>
                                  <strong>Video Receive Packets:</strong> ${stats.videoReceivePackets}<br/>
                                  <strong>Video Receive Packets Lost:</strong> ${stats.videoReceivePacketsLost}<br/>
                                  <strong>Video Receive Resolution Heigh:</strong> ${stats.videoReceiveResolutionHeight}px<br/>  
                                  <strong>Video Receive Resolution Width:</strong> ${stats.videoReceiveResolutionWidth}px
                                `;
          remoteStreamStatsBtn.data('bs.popover').element.dataset.content = remoteStreamStats;
          remoteStreamStatsBtn.data('bs.popover').setContent();
          remoteStreamStatsBtn.popover('update');
        }
      });
      
    }
  }, 1000);
  statsIntervals.remoteStreamInterval = remoteStreamInterval;
}

function disableStats() {
  console.log('disable stats');
    // hide all pop-overs
  hideStatsPopovers()
  for(var interval in statsIntervals) {
    try {
      clearInterval(statsIntervals[interval]);
      statsIntervals[interval] = null;
    } catch (error) {
      console(`error stoping interval: ${interval}`);
      console(error);
    }
  }
}

// quality discriptor 
function setQualityDescriptors(quality, btn, icon) {
  // "0": The network quality is unknown.
  // "1": The network quality is excellent.
  // "2": The network quality is quite good, but the bitrate may be slightly lower than excellent.
  // "3": Users can feel the communication slightly impaired.
  // "4": Users can communicate only not very smoothly.
  // "5": The network is so bad that users can hardly communicate.
  // "6": The network is down and users cannot communicate at all.
  var description;
  var color;
  switch (quality) {
    case 0:
      description = "Unknown"
      color = "#708090"; // slate grey
      break;
    case 1:
      description = "Excellent"
      color = "#3CB371"; // medium sea green
      break;
    case 2:
      description = "Good"
      color = "#90EE90"; // light-green
      break;
    case 3:
      description = "OK"
      color = "#9ACD32"; // yellow-green
      break;
    case 4:
      description = "Not Good"
      color = "#FFFF00"; // yellow
      break;
    case 5:
      description = "Poor"
      color = "#FF8C00"; // dark orange
      break;
    case 6:
      description = "Bad"
      color = "#FF0000"; // red
        break;
    default:
      console.log('Uplink Quality Error - unknown value: ' + stats.uplinkNetworkQuality);
      description = "-";
      color = 'black';
      break;
  }

  if (btn.attr('aria-describedby')) {
    btn.data('bs.popover').element.dataset.content = description;
    btn.data('bs.popover').setContent();
    btn.popover('update');
  }

  icon.css( "color", color); 
}

var printError = function(error, explicit) {
  console.log(`[${explicit ? 'EXPLICIT' : 'INEXPLICIT'}] ${error.name}: ${error.message}`);
}