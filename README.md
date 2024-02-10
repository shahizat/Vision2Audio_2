
# Vision2Audio - Giving the blind an understanding through Vision Language Model

Vision2Audio is a web application designed to enhance the lives of visually impaired and blind individuals by enabling them to capture images, ask questions about them, and receive spoken answers using cutting-edge AI technologies.

The application leverages NVIDIA's Riva Automatic Speech Recognition (ASR) to convert spoken questions into text. This text is then fed into the LLaVA (Large Language-and-Vision Assistant) multimodal model using MLC LLM, which provides comprehensive image description. Finally, NVIDIA's Riva Text-to-Speech (TTS) technology converts the generated text into spoken audio, delivering the answers to the user in an audio format via browser.


### Usage
For simplicity we will assume everything is installed. Start Nvidia Riva server by running the command:
```
bash riva_start.sh
```
Once the Riva server status is running, open another terminal and execute the following command to clone the jetson-containers project
```
git clone https://github.com/dusty-nv/jetson-containers.git
```
Then, run the following command inside the container to start local_llm:
```
./run.sh $(./autotag local_llm) 
```
Keep the server running in the background. Open another terminal and run:
```
python3 -m uvicorn app:app --port 5000 --host 0.0.0.0 --ssl-keyfile ./key.pem --ssl-certfile ./cert.pem
```
Open another terminal and run cloudflared tunnel using the following command:
```
cloudflared tunnel --url http://127.0.0.1:5000
```

### Acknowledgements
The implementation of the project relies on the local_llm project by [Dustin Franklin](https://github.com/dusty-nv) from Nvidia.

