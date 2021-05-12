// UI buttons
function enableUiControls(localStream) {

  $("#mic-btn").prop("disabled", false);
  $("#mic-dropdown").prop("disabled", false);
  $("#video-btn").prop("disabled", false);
  $("#cam-dropdown").prop("disabled", false);
  $("#screen-share-btn").prop("disabled", false);
  $("#exit-btn").prop("disabled", false);
  $("#toggle-stats-btn").prop("disabled", false);
  $("#remote-direct-audio-btn").prop("disabled", false);

  $("#mic-btn").click(function(){
    toggleMic(localStream);
  });

  $("#video-btn").click(function(){
    toggleVideo(localStream);
  });

  $("#remote-direct-audio-btn").click(function(){
    toggleDirectAudio('#remote-direct-audio-btn');
  });

  $("#remote-mic-btn").click(function(){
    console.log('toggle remote mic');
    if($("#remote-mic-btn").hasClass('btn-dark') ){
      // send message to mute remote user
      var muteMsg = { mute: true };
      sendP2PMessage(mainStreamId, muteMsg).then(sendResult => {
        if (sendResult.hasPeerReceived) {
          /* Handle the event that the remote user receives the message. */
        } else {
          /* Handle the event that the message is received by the server but the remote user cannot be reached. */
        }
      }).catch(error => { /* Handle the event of a message send failure. */  });
    } else {
      // send message to unmute
      var unmuteMsg = { mute: false };
      sendP2PMessage(mainStreamId, unmuteMsg).then(sendResult => {
        if (sendResult.hasPeerReceived) {
          /* Handle the event that the remote user receives the message. */
        } else {
          /* Handle the event that the message is received by the server but the remote user cannot be reached. */
        }
      }).catch(error => { /* Handle the event of a message send failure. */  });
    }
  });

  $("#remote-exit-btn").click(function(){
    console.log('toggle remote mic');
    var leaveMsg = { leave: true };
    sendP2PMessage(mainStreamId, leaveMsg).then(sendResult => {
      if (sendResult.hasPeerReceived) {
        /* Handle the event that the remote user receives the message. */
      } else {
        /* Handle the event that the message is received by the server but the remote user cannot be reached. */
      }
    }).catch(error => { /* Handle the event of a message send failure. */  });
  });


  $("#screen-share-btn").click(function(){
    toggleScreenShareBtn(); // set screen share button icon
    $("#screen-share-btn").prop("disabled",true); // disable the button on click
    if(screenShareActive){
      stopScreenShare();
    } else {
      var agoraAppId = $('#form-appid').val();
      var channelName = $('#form-channel').val();
      initScreenShare(agoraAppId, channelName); 
    }
  });

  $("#exit-btn").click(function(){
    console.log("so sad to see you leave the channel");
    leaveChannel(); 
  });

  $("#toggle-stats-btn").click(function(){
    
    var statusColor = $("#toggle-stats-icon").css('color');
    if(statusColor == 'rgb(33, 37, 41)') {
      enableStats();
      statusColor = 'rgb(255, 0, 0)';
    } else {
      disableStats();
      statusColor = 'rgb(33, 37, 41)';
    }
    $("#toggle-stats-icon").css('color', statusColor);
    // add check to disable stats
    document.querySelectorAll('.stats-btn-container').forEach(function(statsContianerDiv){
      var display;      
      if(window.getComputedStyle(statsContianerDiv).display === 'none') {
       
        display = "block";
      } else {
        display = "none"; 
      }
      statsContianerDiv.style.display = display;
    });
  });

  // keyboard listeners 
  $(document).keypress(function(e) {
    switch (e.key) {
      case "m":
        console.log("quick toggle the mic");
        toggleMic(localStream);
        break;
      case "v":
        console.log("quick toggle the video");
        toggleVideo(localStream);
        break; 
      case "s":
        console.log("initializing screen share");
        toggleScreenShareBtn(); // set screen share button icon
        $("#screen-share-btn").prop("disabled",true); // disable the button on click
        if(screenShareActive){
          stopScreenShare();
        } else {
          initScreenShare(); 
        }
        break;  
      case "q":
        console.log("so sad to see you quit the channel");
        leaveChannel(); 
        break;   
      default:  // do nothing
    }

    // (for testing) 
    if(e.key === "r") { 
      window.history.back(); // quick reset
    }
  });
}

function setUiEventListensers() {
  
}

function toggleBtn(btn){
  btn.toggleClass('btn-dark').toggleClass('btn-danger');
}

function toggleScreenShareBtn() {
  // $('#screen-share-btn').toggleClass('btn-danger');
  $('#screen-share-icon').toggleClass('fa-share-square').toggleClass('fa-times-circle');
  var statusColor = $("#screen-share-icon").css('color');
  if(statusColor == 'rgb(33, 37, 41)') {
    statusColor = 'rgb(255, 0, 0)';
  } else {
    statusColor = 'rgb(33, 37, 41)';
  }
  $("#screen-share-icon").css('color', statusColor);
}

function toggleVisibility(elementID, visible) {
  if (visible) {
    $(elementID).attr("style", "display:block");
  } else {
    $(elementID).attr("style", "display:none");
  }
}

function toggleMic(localStream) {
  toggleBtn($("#mic-btn")); // toggle button colors
  toggleBtn($("#mic-dropdown"));
  $("#mic-icon").toggleClass('fa-microphone').toggleClass('fa-microphone-slash'); // toggle the mic icon
  if ($("#mic-icon").hasClass('fa-microphone')) {
    localStream.unmuteAudio(); // enable the local mic
  } else {
    localStream.muteAudio(); // mute the local mic
  }
}

function toggleDirectAudio(micBtnID) {
//   remote-direct-audio-btn
// remote-direct-audio-icon
  $(micBtnID).toggleClass('btn-dark').toggleClass('btn-success');
}

function toggleVideo(localStream) {
  toggleBtn($("#video-btn")); // toggle button colors
  toggleBtn($("#cam-dropdown"));
  $("#video-icon").toggleClass('fa-video').toggleClass('fa-video-slash'); // toggle the video icon
  if ($("#video-icon").hasClass('fa-video')) {
    localStream.unmuteVideo(); // enable the local video
    toggleVisibility("#no-local-video", false); // hide the user icon when video is enabled
  } else {
    localStream.muteVideo(); // disable the local video
    toggleVisibility("#no-local-video", true); // show the user icon when video is disabled
  }
}

function toggleRemoteMic(micBtnID,micIconID) {
  toggleBtn($(micBtnID)); // toggle button colors
  $(micIconID).toggleClass('fa-microphone').toggleClass('fa-microphone-slash'); // toggle the mic icon
  if ($(micIconID).hasClass('fa-microphone')) {
    // send a message to enable the remote mic
  } else {
    //  send a message to mute the remote mic
  }
}