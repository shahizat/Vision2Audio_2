from local_llm import LocalLM, ChatHistory
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, File, UploadFile, Form, Request, Depends, Response, status
from fastapi.responses import HTMLResponse, StreamingResponse
from starlette.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles 
import uvicorn
import requests
import base64
import os
from pydub import AudioSegment
import io
from PIL import Image
from io import BytesIO
import grpc
import riva.client
import numpy as np
from scipy.io.wavfile import write
from typing import List

auth = riva.client.Auth(uri='localhost:50051')
riva_asr = riva.client.ASRService(auth)
tts_service = riva.client.SpeechSynthesisService(auth)

language_code = "en-US" 
sample_rate_hz = 44100  
voice_name = "English-US.Female-1" 
data_type = np.int16  

app = FastAPI()

class ChatInput(BaseModel):
    prompts: List[str]
    image_path: str

# Preload the model
#model_path = "/data/models/huggingface/models--liuhaotian--llava-v1.5-7b/snapshots/12e054b30e8e061f423c7264bc97d4248232e965"
model_path = "/data/models/huggingface/models--liuhaotian--llava-v1.5-13b/snapshots/d64eb781be6876a5facc160ab1899281f59ef684"
preloaded_model = LocalLM.from_pretrained(model_path, quant=False, api="mlc", vision_model=None)

chat_history = ChatHistory(preloaded_model, "llava-v1", None)


os.makedirs("static", exist_ok=True)

app.mount("/static", StaticFiles(directory="static",html = True), name="static")


templates = Jinja2Templates(directory="templates")

@app.get('/')
async def index_loader(request: Request):
    return templates.TemplateResponse('index.html', {"request": request})


@app.route('/describe', methods=['POST'])
async def describe(request: Request):
    data = await request.json()
    encoded_string = data.get('image', '')
    audio_transcription = data.get('audioTranscription')
    print("Audio transcription" + audio_transcription)

    image_data = base64.b64decode(encoded_string)
    image = Image.open(io.BytesIO(image_data))
 
    entry = chat_history.append(role="user", image=image)
    entry = chat_history.append(role="user", msg=audio_transcription)

   
    embedding, position = chat_history.embed_chat()

    async def generate_reply():
        reply = preloaded_model.generate(
            embedding,
            streaming=True,
            kv_cache=chat_history.kv_cache,
            max_new_tokens=100,
            min_new_tokens=1,
            do_sample=True,
            repetition_penalty=1.0,
            temperature=1.0,
            top_p=1.0,
        )
        bot_reply = chat_history.append(role="bot", text=reply)
        for token in reply:
            if token != '</s>':
                yield token
        chat_history.reset()

    return StreamingResponse(generate_reply(), media_type='text/event-stream')


@app.post('/stopRecording')
async def stop_recording(audio: UploadFile = File(...)):
    transcript = await process_audio(audio)
    return {"transcript": transcript}


async def process_audio(audio_data: UploadFile):
    buffer = BytesIO()
    buffer.write(audio_data.file.read())
    buffer.seek(0)
    audio = AudioSegment.from_file(buffer)
    audio = audio.set_frame_rate(16000)
    audio = audio.set_sample_width(2)
    audio = audio.set_channels(1)

    processed_buffer = BytesIO()
    audio.export(processed_buffer, format="wav")
    processed_buffer.seek(0)


    asr_transcript = asr(processed_buffer)

    return asr_transcript


@app.route('/tts', methods=['POST'])
async def tts_endpoint(request: Request):
    text = (await request.json())['answer']
    audio_samples = tts(text)
    result_bytes = tts_to_bytesio(audio_samples)
    return StreamingResponse(io.BytesIO(result_bytes), media_type='audio/wav')

def tts(text: str):
    resp = tts_service.synthesize(text, voice_name=voice_name, language_code=language_code, sample_rate_hz=sample_rate_hz)
    audio_samples = np.frombuffer(resp.audio, dtype=data_type)
    return audio_samples

def tts_to_bytesio(tts_object: object) -> bytes:
    bytes_wav = bytes()
    byte_io = io.BytesIO(bytes_wav)
    write(byte_io, sample_rate_hz, tts_object)
    result_bytes = byte_io.read()
    return result_bytes

def asr(audio_input):
    if isinstance(audio_input, io.IOBase):
        content = audio_input.read()
    else:
        with io.open(audio_input, 'rb') as fh:
            content = fh.read()
    config = riva.client.RecognitionConfig()
    config.language_code = "en-US"
    config.max_alternatives = 1
    config.enable_automatic_punctuation = True
    config.audio_channel_count = 1

    response = riva_asr.offline_recognize(content, config)
    asr_best_transcript = response.results[0].alternatives[0].transcript
    return asr_best_transcript

if __name__ == '__main__':
    uvicorn.run(app)
