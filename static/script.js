function captureUserMedia(mediaConstraints, successCallback, errorCallback) {
  navigator.mediaDevices.getUserMedia(mediaConstraints).then(successCallback).catch(errorCallback);
}

Howler.autoUnlock = false;

var mediaConstraints = {
  audio: true
};

var mediaRecorder;
var isRecording = false;
var currentTTS = null;

// Function to stop current TTS playback
function stopTTS() {
  if (currentTTS && !currentTTS.ended) {
    currentTTS.pause();
    currentTTS.currentTime = 0;
  }
}

document.querySelector('#start-recording').onclick = function () {
  if (!isRecording) {
    this.disabled = true;
    isRecording = true;
    stopTTS(); // Stop TTS playback when recording starts
    captureUserMedia(mediaConstraints, onMediaSuccess, onMediaError);
    const descriptionDiv = document.getElementById('description');
    descriptionDiv.textContent = 'Recording...';
  } else {
    stopRecording();
  }
};

function onMediaSuccess(stream) {
  var audiosContainer = document.getElementById('audios-container');
  var audio = document.createElement('audio');
  audio.controls = true;
  audio.muted = true;
  audio.srcObject = stream;
  audio.play();
  audiosContainer.appendChild(audio);



  mediaRecorder = new MediaStreamRecorder(stream);
  mediaRecorder.stream = stream;
  mediaRecorder.recorderType = StereoAudioRecorder;
  mediaRecorder.mimeType = 'audio/wav';

  mediaRecorder.ondataavailable = function (blob) {
    if (isRecording) {
      var a = document.createElement('a');
      a.target = '_blank';
      a.href = URL.createObjectURL(blob);
      audiosContainer.appendChild(a);
      audiosContainer.appendChild(document.createElement('hr'));
      sendAudioToBackend(blob);
    }
  };

  var timeInterval = 5000;
  mediaRecorder.start(parseInt(timeInterval));

  // Stop recording after the specified interval
  setTimeout(function () {
    isRecording = false;
    mediaRecorder.stop();
    mediaRecorder.stream.stop();
    document.querySelector('#start-recording').disabled = false;
  }, timeInterval);

}

function onMediaError(e) {
  console.error('media error', e);
}

let video = document.getElementById('videoElement');
let facingMode = 'environment';
let stream = null;

function startVideo() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
  navigator.mediaDevices.getUserMedia({ video: { facingMode: facingMode } })
    .then(function (mediaStream) {
      stream = mediaStream;
      video.srcObject = mediaStream;
      video.onloadedmetadata = function (e) {
        video.play();
        if (facingMode === 'user') {
          video.style.transform = 'scaleX(-1)';
        } else {
          video.style.transform = 'scaleX(1)';
        }
      };
    })
    .catch(function (err) { console.log(err.name + ': ' + err.message); });
}





function sendAudioToBackend(audioBlob) {
  const descriptionDiv = document.getElementById('description');
  const formData = new FormData();
  formData.append('audio', audioBlob);
  
  fetch('/stopRecording', {
    method: 'POST',
    body: formData,
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return response.json(); 
  })
  .then(data => {
    const asrTranscript = data.transcript;
    console.log('ASR Transcript:', asrTranscript );
    triggerDescribeRequest(asrTranscript)

   descriptionDiv.textContent = `ASR Transcript: ${asrTranscript}`;
  })
  .catch(error => {
    console.error('Error:', error);
  });
}



function triggerDescribeRequest(audioTranscription) {
  let canvas = document.createElement('canvas');
  canvas.width = video.clientWidth;
  canvas.height = video.clientHeight;
  let ctx = canvas.getContext('2d');

  function drawVideoToCanvas() {
    const videoRatio = video.videoWidth / video.videoHeight;
    const canvasRatio = canvas.width / canvas.height;
    let drawWidth, drawHeight, startX, startY;

    if (videoRatio > canvasRatio) {
      drawHeight = video.videoHeight;
      drawWidth = video.videoHeight * canvasRatio;
      startX = (video.videoWidth - drawWidth) / 2;
      startY = 0;
    } else {
      drawWidth = video.videoWidth;
      drawHeight = video.videoWidth / canvasRatio;
      startX = 0;
      startY = (video.videoHeight - drawHeight) / 2;
    }

    ctx.drawImage(video, startX, startY, drawWidth, drawHeight, 0, 0, canvas.width, canvas.height);
  }

  drawVideoToCanvas();

  let dataURL = canvas.toDataURL('image/png');
  let base64ImageContent = dataURL.replace(/^data:image\/(png|jpg);base64,/, '');

  const descriptionDiv = document.getElementById('description');

  descriptionDiv.textContent = 'Loading...';


  const requestData = {
    image: base64ImageContent,
    audioTranscription: audioTranscription,
  };

  fetch('/describe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestData),
  })
  .then((response) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    descriptionDiv.textContent = '';
    reader.read().then(function processText({ done, value }) {
      if (done) {
        if (buffer.length) {
          descriptionDiv.textContent += buffer + ' ';
          console.log('LLava answer:', descriptionDiv.textContent );
          text2speech(descriptionDiv.textContent);
    
        }
        return;
      }
      const text = buffer + decoder.decode(value, { stream: true });
      const words = text.split(' ');
      buffer = words.pop();
      words.forEach((word) => (descriptionDiv.textContent += word + ' '));
      reader.read().then(processText);
    });
  })
  .catch((err) => console.error(err));
}

function text2speech(text) {
  fetch('/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ answer: text }),
  })
  .then(response => response.blob())
  .then(blob => {
    // Convert the blob to a URL
    const url = URL.createObjectURL(blob);

    // Create a Howl instance for TTS
    currentTTS = new Howl({
      src: [url],
      html5: true,
      autoplay: true, // Set autoplay to true
      onend: function() {
        console.log('TTS playback finished.');
        currentTTS = null; // Reset currentTTS when audio ends
      },
      onplayerror: function() {
        // When playerror occurs, wait for the unlock event and then play audio
        currentTTS.once('unlock', function() {
          currentTTS.play();
        });
      }
    });

    // Trigger audio playback
    currentTTS.play();
  })
  .catch(error => console.error('Error:', error));
}
startVideo();


