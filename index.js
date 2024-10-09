import { exec } from "child_process";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { promises as fs } from "fs";
import mongoose from "mongoose"; 
import googleTTS from 'google-tts-api';
import fetch from 'node-fetch'; 
import { GoogleGenerativeAI } from '@google/generative-ai';
import Contact from "./models/Contact.js";
import User from "./models/User.js";
import bcrypt from 'bcrypt';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());
const port = 3000;

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('Connected to MongoDB');
}).catch((error) => {
  console.error('Error connecting to MongoDB:', error);
});

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, message } = req.body;

    const newContact = new Contact({
      name,
      email,
      message,
    });

    await newContact.save();

    res.status(201).json({ message: "Contact form submitted successfully" });
  } catch (error) {
    console.error('Error saving contact form data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post("/api/users", async (req, res) => {
  try {
    const { email, password, account } = req.body;

    if (!email || !password || !account) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = new User({
      email,
      password: hashedPassword,  
      account,
    });

    await newUser.save();

    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    console.error('Error saving user data:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.status(200).json({ message: 'Login successful' });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing command: ${command}`, error);
        reject(error);
      }
      resolve(stdout);
    });
  });
};

const lipSyncMessage = async (message) => {
  const time = new Date().getTime();

  
  const wavFileName = message.replace('.mp3', '.wav');
  await execCommand(`ffmpeg -y -i ${message} ${wavFileName}`);

  

  const rhubarbPath = './Rhubarb-Lip-Sync/rhubarb'; 
  

  const jsonFileName = message.replace('.mp3', '.json');
  await execCommand(`"${rhubarbPath}" -f json -o ${jsonFileName} ${wavFileName} -r phonetic`);
};
const splitText = (text, maxLength) => {
  const chunks = [];
  for (let i = 0; i < text.length; i += maxLength) {
      chunks.push(text.slice(i, i + maxLength));
  }
  return chunks;
};
const generateResponse = async (message, animations) => {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  const genAI = new GoogleGenerativeAI(apiKey);


  const prompt = `
    You are an AI designed to simulate a virtual fitness trainer. Respond energetically and motivationally to the following user message. 
    Format your response as a JSON object with the following keys: "text" and "animation".Do not include any "emoji" in your response. 
    The "text" key should contain the response message, and the "animation" key should suggest the most appropriate animation from the following list:
    ${animations.join(', ')}.

    Example format:
    {
      "text": "Your response message here",
      "animation": "SuggestedAnimation"
    }

    User: "${message}"
    Trainer:
  `;

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const response = await model.generateContent([{ text: prompt }]);

    console.log('Gemini API raw response:', JSON.stringify(response, null, 2));

    const responseText = response?.response?.candidates?.[0]?.content?.parts?.[0]?.text.trim();

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(responseText);
    } catch (error) {
      console.error('Error parsing JSON response:', error);
      throw new Error('Failed to parse response');
    }

    const responseMessage = parsedResponse.text || "Default response";
    const animation = parsedResponse.animation || "Idle"; 

    return { text: responseMessage, animation };
  } catch (error) {
    console.error('Error generating response from Gemini:', error);
    throw new Error('Failed to generate response');
  }
};
const fetchAudioAndLipSyncData = async (text, fileNamePrefix) => {
  const url = googleTTS.getAudioUrl(text, {
    lang: 'en',
    slow: false,
    host: 'https://translate.google.com',
  });

  const fileName = `audios/${fileNamePrefix}_${new Date().getTime()}.mp3`;
  const audioData = await fetch(url);
  const buffer = await audioData.arrayBuffer();
  await fs.writeFile(fileName, Buffer.from(buffer));

  await lipSyncMessage(fileName);
  const audioBase64 = await audioFileToBase64(fileName);
  const jsonFileName = fileName.replace('.mp3', '.json');
  const lipsyncData = await readJsonTranscript(jsonFileName);

  return { audioBase64, lipsyncData };
};
let count = 0; 

// app.post("/api/countinc", async (req, res) => {
//   try {
//     const { count: newCount } = req.body; 
//     if (newCount !== undefined && !isNaN(newCount)) {
//       count = newCount;  // set the count to the value sent from the Python script
//       res.status(200).send({ message: "Count updated", count: count });
//     } else {
//       res.status(400).send({ error: "Invalid count value" });
//     }
//   } catch (error) {
//     console.error("Error in /countinc route:", error);
//     res.status(500).send({ error: "Internal Server Error" });
//   }
// });

// const path = './audios'; 

// const deleteAllAudioFiles = async () => {
//   try {
//     const files = await fs.readdir(path);
//     for (const file of files) {
//       await fs.unlink(`${path}/${file}`);
//       console.log(`Deleted file: ${file}`);
//     }
//   } catch (error) {
//     console.error('Error deleting audio files:', error);
//   }
// };

// app.post("/api/count", async (req, res) => {
//   try {
//     const countText = `${count}`;
//     const { audioBase64, lipsyncData } = await fetchAudioAndLipSyncData(countText, 'count');

//     res.send({
//       messages: [{
//         text: countText,
//         count: count,  
//         audio: audioBase64,
//         lipsync: lipsyncData,
//         facialExpression: "smile",
//         animation: "Idle",
//       }]
//     });
//     setTimeout(async () => {
//       console.log("Starting file deletion...");
//       await deleteAllAudioFiles();
//       console.log("File deletion completed.");
//     }, 1000);  
//   } catch (error) {
//     console.error("Error in /count route:", error);
//     res.status(500).send({ error: "Internal Server Error" });
//   }
// });
app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;
  const animations = ["Angry", "Crying", "Laughing", "Idle", "Talking_0", "Talking_1", "Terrified"];

  if (!userMessage) {
    return res.send({ messages: [] });
  }

  try {
    const { text: responseMessage, animation } = await generateResponse(userMessage, animations);
    const cleanedMessage = responseMessage.replace(/[\u{1F600}-\u{1F64F}]/gu, '');
    const chunks = splitText(cleanedMessage, 200);

    let messages = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const { audioBase64, lipsyncData } = await fetchAudioAndLipSyncData(chunk, `message_${i}`);

      messages.push({
        text: chunk,
        audio: audioBase64,
        lipsync: lipsyncData,
        facialExpression: "smile",
        animation: animation,
      });
    }

    res.send({ messages });
  } catch (error) {
    console.error('Error in /chat route:', error);
    res.status(500).send({ error: 'Internal Server Error' });
  }
});
const readJsonTranscript = async (file) => {
  try {
    const data = await fs.readFile(file, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading JSON transcript:', error);
    throw new Error('Failed to read JSON transcript');
  }
};

const audioFileToBase64 = async (file) => {
  try {
    const data = await fs.readFile(file);
    return data.toString("base64");
  } catch (error) {
    console.error('Error converting audio file to base64:', error);
    throw new Error('Failed to convert audio file to base64');
  }
};

app.listen(port, () => {
  console.log(`Posture Perfect listening on port ${port}`);
});
