require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const OpenAI = require('openai'); // Updated OpenAI import
const validator = require('validator');
const session = require('express-session'); // For session handling
const path = require('path'); // Add the missing path module
const sequelize = require('./config/database'); // Sequelize instance
const CleanedText = require('./models/CleanedText'); // Sequelize model
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const User = require('./models/User');
const UserUrl = require('./models/UserUrl');
const fs = require('fs');


const app = express();
const PORT = 3000;

// Set up OpenAI API client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Make sure your .env file contains the key
});

// Middleware to parse JSON bodies and handle sessions
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Set up session middleware
app.use(session({
  secret: 'yourSecretKey',
  resave: false,
  saveUninitialized: true,
}));

// Set the view engine for rendering HTML pages
app.set('views', path.join(__dirname, 'views')); // Fixed the views path
app.set('view engine', 'ejs');

// Create MySQL database connection using environment variables from .env
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  
  db.connect((err) => {
    if (err) {
      console.error('Error connecting to MySQL:', err);
      return;
    }
    console.log('Connected to MySQL Database');
  });
  

User.hasMany(UserUrl, { foreignKey: 'userId', as: 'urls' });
UserUrl.belongsTo(User, { foreignKey: 'userId', as: 'user' }); 


// Sync the database
sequelize.sync().then(() => {
    console.log('Database synced');
  }).catch(err => {
    console.error('Error syncing database:', err);
  });



// Middleware to pass the logged-in user's data to EJS templates
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
  });


  // Middleware to check if the user is authenticated
function ensureAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
      return next(); // If authenticated, proceed to the next function
    } else {
      res.redirect('/login'); // If not authenticated, redirect to login
    }
  }



// Serve the main page (index.html)
app.get('/', (req, res) => {
    res.render('index');
});



// Route: Render login page
app.get('/login', (req, res) => {
    res.render('login', { message: null });
  });
  
  // Route: Handle login form submission
  app.post('/login', async (req, res) => {
    const { email, password } = req.body;
  
    try {
      // Query database to check if user exists
      const [rows] = await db.promise().query('SELECT * FROM users WHERE email = ?', [email]);
  
      if (rows.length === 0) {
        // If no user found, display pop-up with error message
        return res.render('login', { message: 'No Account found' });
      }
  
      const user = rows[0];
  
      // Compare password with stored hash
      const match = await bcrypt.compare(password, user.password);
  
      if (!match) {
        // If password doesn't match, show error message
        return res.render('login', { message: 'Incorrect password' });
      }
  
      // Store user data in session
      req.session.user = {
        id: user.id,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
      };
  
      // Redirect to next page after successful login
      res.redirect('/');
    } catch (err) {
      console.error('Error during login:', err);
      res.status(500).send('Internal Server Error');
    }
  });

  // Serve the next page (next.ejs) only if the user is authenticated
app.get('/next', ensureAuthenticated, (req, res) => {
    res.render('next', { user: req.session.user });
});


// POST route to handle URL submission and redirect to 'next' page
app.post('/next', ensureAuthenticated, async (req, res) => {
    const { url } = req.body;
    const userId = req.session.user.id; // Get the logged-in user's ID from the session
  
    if (!validator.isURL(url)) {
      return res.status(400).json({ error: 'Invalid URL' });
    }
  
    try {
      // Store the URL in the UserUrl table associated with the userId
      const newUrl = await UserUrl.create({
        url: url,
        userId: userId,  // Associate the URL with the logged-in user's ID
      });
  
      // Store the new URL record ID in the session
      req.session.urlId = newUrl.id;
  
      // Redirect to the next page
      res.redirect('/next');
    } catch (error) {
      console.error('Error storing URL:', error); // Add detailed error logging
      res.status(500).json({ error: 'Failed to store the URL' });
    }
  });
  
  


const CHUNK_SIZE = 2000; // Approximate character size per chunk for pagination
const MAX_TOKENS = 1500; // Max tokens for each OpenAI response

// Helper function to split text into chunks
function splitTextIntoChunks(text, chunkSize) {
    const chunks = [];
    let startIndex = 0;
    while (startIndex < text.length) {
        chunks.push(text.slice(startIndex, startIndex + chunkSize));
        startIndex += chunkSize;
    }
    return chunks;
}

app.post('/submit-url', ensureAuthenticated, async (req, res) => {
    const { url } = req.body;
    const userId = req.session.user.id; // Get the logged-in user's ID
  
    // Validate the URL
    if (!validator.isURL(url)) {
      return res.status(400).json({ error: 'Invalid URL' });
    }
  
    try {
      // Fetch and scrape the webpage content
      const response = await axios.get(url);
      const html = response.data;
      const $ = cheerio.load(html);
      let textContent = '';
      $('p, h1, h2, h3').each((index, element) => {
        textContent += $(element).text() + '\n';
      });
  
      if (!textContent || textContent.length < 50) {
        return res.status(400).json({ error: 'Not enough content to process' });
      }
  
      // Process the scraped text with OpenAI
      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "user", content: `Keep only the useful text from the following content and remove anything unnecessary:\n\n${textContent}` }
        ],
      });
  
      const cleanedText = completion.choices[0].message.content.trim();
  
      // Store the URL and cleaned text in the UserUrl table associated with the user
      await UserUrl.create({
        userId: userId,
        url: url,
        cleanedText: cleanedText,
      });
  
      // Redirect to the profile page after storing the data
      res.redirect('/profile');
    } catch (error) {
      console.error('Error processing URL:', error);
      res.status(500).json({ error: 'Failed to process the URL' });
    }
});


app.post('/tts', ensureAuthenticated, async (req, res) => {
  const { url } = req.body;

  try {
      // Fetch the UserUrl entry based on URL and user ID
      const userUrl = await UserUrl.findOne({ where: { url, userId: req.session.user.id } });
      if (!userUrl || !userUrl.cleanedText) {
          return res.status(400).json({ error: 'No cleaned text found for the given URL.' });
      }

      // If audioData already exists, send it without generating new audio
      if (userUrl.audioData) {
          res.set({
              'Content-Type': 'audio/mpeg',
              'Content-Disposition': 'inline; filename="tts-audio.mp3"',
          });
          return res.send(userUrl.audioData);
      }

      // Call OpenAI API to generate speech using the cleanedText
      const response = await axios({
          method: 'post',
          url: 'https://api.openai.com/v1/audio/speech',
          headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer', // Ensure binary data is returned
          data: {
              model: "tts-1",
              voice: "alloy", // Choose your desired voice
              input: userUrl.cleanedText,
          },
      });

      // Convert the response data into a buffer
      const audioBuffer = Buffer.from(response.data);

      // Update the UserUrl with the generated audioData
      await userUrl.update({ audioData: audioBuffer });

      // Send the audio back to the user
      res.set({
          'Content-Type': 'audio/mpeg',
          'Content-Disposition': 'inline; filename="tts-audio.mp3"',
      });
      res.send(audioBuffer);

  } catch (error) {
      console.error('Error generating TTS audio:', error);
      res.status(500).json({ error: 'Error generating TTS audio.' });
  }
});

  

app.get('/iRead', ensureAuthenticated, async (req, res) => {
  const urlId = req.session.urlId;

  try {
      // Fetch the URL from the database using the urlId
      const userUrl = await UserUrl.findOne({ where: { id: urlId } });
      if (!userUrl) {
          return res.render('iRead', { cleanedText: 'No URL was found for processing', url: '' });
      }

      const url = userUrl.url;

      // Check if the cleanedText already exists in the database
      if (userUrl.cleanedText && userUrl.cleanedText.length > 3) {
          // CleanedText already exists, display it without making an API call
          return res.render('iRead', { cleanedText: userUrl.cleanedText, url: userUrl.url });
      }

      // If cleanedText doesn't exist or is less than 3 characters, perform the cleaning process
      const response = await axios.get(url);
      const html = response.data;
      const $ = cheerio.load(html);
      let textContent = '';
      $('p, h1, h2, h3').each((index, element) => {
          textContent += $(element).text() + '\n';
      });

      if (!textContent || textContent.length < 50) {
          return res.render('iRead', { cleanedText: 'Not enough content to process', url: userUrl.url });
      }

      // Call OpenAI to clean the text
      const completion = await openai.chat.completions.create({
          model: "gpt-4",
          messages: [
              { role: "user", content: `Keep only the useful text from the following content and remove anything unnecessary:\n\n${textContent}` }
          ],
      });

      const cleanedText = completion.choices[0].message.content.trim();

      // Update the cleanedText in the UserUrl table
      await userUrl.update({ cleanedText: cleanedText });

      // Render the iRead page with the newly cleaned text
      res.render('iRead', { cleanedText: cleanedText, url: userUrl.url });

  } catch (error) {
      console.error('Error processing URL:', error);
      res.status(500).json({ error: 'Failed to process the URL' });
  }
});





// Serve the iSummarize page (iSummarize.html)
app.get('/iSummarize', ensureAuthenticated, async (req, res) => {
  const urlId = req.session.urlId; // Assume the URL is already stored in session

  try {
      // Fetch the URL entry from the database
      const userUrl = await UserUrl.findOne({ where: { id: urlId } });

      if (!userUrl) {
          console.log('No URL found for processing');
          return res.render('iSummarize', { summaryText: 'No URL was found for processing', url: '' });
      }

      // If `summaryText` already exists, display it
      if (userUrl.summaryText && userUrl.summaryText.length > 0) {
          console.log('Summary already exists. Displaying summary:', userUrl.summaryText);
          return res.render('iSummarize', { summaryText: userUrl.summaryText, url: userUrl.url });
      }

      // If `cleanedText` doesn't exist, generate it
      if (!userUrl.cleanedText || userUrl.cleanedText.length < 3) {
          console.log('No cleanedText found. Fetching and cleaning content from URL...');
          const response = await axios.get(userUrl.url);
          const html = response.data;
          const $ = cheerio.load(html);
          let textContent = '';
          $('p, h1, h2, h3').each((index, element) => {
              textContent += $(element).text() + '\n';
          });

          if (!textContent || textContent.length < 50) {
              console.log('Not enough content to process');
              return res.render('iSummarize', { summaryText: 'Not enough content to process', url: userUrl.url });
          }

          // Use OpenAI to clean the text
          const completion = await openai.chat.completions.create({
              model: "gpt-4",
              messages: [{ role: "user", content: `Keep only the useful text from the following content and remove anything unnecessary:\n\n${textContent}` }],
          });

          const cleanedText = completion.choices[0].message.content.trim();
          console.log('Cleaned text generated:', cleanedText);

          // Update the UserUrl with cleanedText
          await userUrl.update({ cleanedText });
      }

      // Generate the summary using OpenAI
      console.log('Generating summary for cleanedText...');
      const summaryResponse = await openai.chat.completions.create({
          model: "gpt-4",
          messages: [{ role: "user", content: `Summarize the following text:\n\n${userUrl.cleanedText}` }],
      });

      const summaryText = summaryResponse.choices[0].message.content.trim();
      console.log('Generated summary:', summaryText);

      // Check if summaryText was successfully generated
      if (!summaryText || summaryText.length < 3) {
          console.log('Failed to generate summary or summary is too short');
          return res.render('iSummarize', { summaryText: 'Failed to generate summary', url: userUrl.url });
      }

      // Update the UserUrl with the new summary
      await userUrl.update({ summaryText });

      // Confirm that the summary is stored in the database
      const updatedUserUrl = await UserUrl.findOne({ where: { id: urlId } });
      console.log('Stored summary in database:', updatedUserUrl.summaryText);

      // Render the page with the generated summary
      res.render('iSummarize', { summaryText: updatedUserUrl.summaryText, url: updatedUserUrl.url });

  } catch (error) {
      console.error('Error summarizing content:', error);
      res.status(500).json({ error: 'Failed to summarize the content.' });
  }
});


app.post('/tts-summary', ensureAuthenticated, async (req, res) => {
  const { url } = req.body;

  try {
      // Fetch the UserUrl entry based on URL and user ID
      const userUrl = await UserUrl.findOne({ where: { url, userId: req.session.user.id } });
      if (!userUrl || !userUrl.summaryText) {
          return res.status(400).json({ error: 'No summary text found for the given URL.' });
      }

      // If summaryAudioFile already exists, send it without generating new audio
      if (userUrl.summaryAudioFile) {
          res.set({
              'Content-Type': 'audio/mpeg',
              'Content-Disposition': 'inline; filename="tts-summary-audio.mp3"',
          });
          return res.send(userUrl.summaryAudioFile);
      }

      // Call OpenAI API to generate speech using the summaryText
      const response = await axios({
          method: 'post',
          url: 'https://api.openai.com/v1/audio/speech',
          headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer', // Ensure binary data is returned
          data: {
              model: "tts-1",
              voice: "alloy", // Choose your desired voice
              input: userUrl.summaryText,
          },
      });

      // Convert the response data into a buffer
      const audioBuffer = Buffer.from(response.data);

      // Update the UserUrl with the generated summaryAudioFile
      await userUrl.update({ summaryAudioFile: audioBuffer });

      // Send the audio back to the user
      res.set({
          'Content-Type': 'audio/mpeg',
          'Content-Disposition': 'inline; filename="tts-summary-audio.mp3"',
      });
      res.send(audioBuffer);

  } catch (error) {
      console.error('Error generating TTS summary audio:', error);
      res.status(500).json({ error: 'Error generating TTS summary audio.' });
  }
});



app.post('/simpler-summary', ensureAuthenticated, async (req, res) => {
  const { url } = req.body;

  try {
      // Fetch the UserUrl entry based on URL and user ID
      const userUrl = await UserUrl.findOne({ where: { url, userId: req.session.user.id } });
      if (!userUrl || !userUrl.summaryText) {
          return res.status(400).json({ error: 'No summary text found for the given URL.' });
      }

      // Call OpenAI to generate a simpler summary of the existing summaryText
      const completion = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: [
              { role: 'user', content: `Summarize the following text in simpler language:\n\n${userUrl.summaryText}` },
          ],
      });

      const simplerSummary = completion.choices[0].message.content.trim();

      // Send the simpler summary back to the client
      res.json({ simplerSummary });

  } catch (error) {
      console.error('Error generating simpler summary:', error);
      res.status(500).json({ error: 'Error generating simpler summary.' });
  }
});


app.post('/in-depth-summary', ensureAuthenticated, async (req, res) => {
  const { url } = req.body;

  try {
      // Fetch the UserUrl entry based on URL and user ID
      const userUrl = await UserUrl.findOne({ where: { url, userId: req.session.user.id } });
      if (!userUrl || !userUrl.summaryText) {
          return res.status(400).json({ error: 'No summary text found for the given URL.' });
      }

      // Generate an in-depth summary using OpenAI
      const completion = await openai.chat.completions.create({
          model: "gpt-4",
          messages: [
              { role: "user", content: `Please provide a more in-depth version of the following summary:\n\n${userUrl.summaryText}` }
          ],
      });

      const inDepthSummary = completion.choices[0].message.content.trim();

      // Respond with the in-depth summary
      res.json({ inDepthSummary });

  } catch (error) {
      console.error('Error generating in-depth summary:', error);
      res.status(500).json({ error: 'Failed to generate in-depth summary.' });
  }
});




// Serve the iRecommend page (iRecommend.html)
app.get('/iRecommend', (req, res) => {
    res.render('iRecommend');
});


app.get('/profile', ensureAuthenticated, async (req, res) => {
    try {
      // Fetch all URL entries associated with the user
      const userUrls = await UserUrl.findAll({
        where: { userId: req.session.user.id },
      });
  
      // Render the profile page with the user's URLs and cleaned text
      res.render('profile', { user: req.session.user, urls: userUrls });
    } catch (err) {
      console.error('Error fetching user data:', err);
      res.status(500).send('Internal Server Error');
    }
  });
  
  

// Serve the signup page (signup.ejs)
app.get('/signup', (req, res) => {
    res.render('signup');
});

// Sign up POST request
app.post('/signup',
  [
    body('firstName').notEmpty().withMessage('First name is required'),
    body('lastName').notEmpty().withMessage('Last name is required'),
    body('email').isEmail().withMessage('Invalid email address'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
      .matches(/\d/).withMessage('Password must contain a number'),
    body('confirmPassword').custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Password confirmation does not match password');
      }
      return true;
    })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    const errorArray = errors.array(); 

    if (!errors.isEmpty()) {
      return res.render('signup', { 
        errors: errorArray, 
        message: null 
      });
    }

    const { firstName, lastName, email, username, password } = req.body;

    try {
      const [rows] = await db.promise().query('SELECT * FROM users WHERE email = ?', [email]);
      if (rows.length > 0) {
        return res.render('signup', { 
          errors: [], 
          message: 'Email already exists' 
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      await db.promise().query(
        'INSERT INTO users (first_name, last_name, email, username, password) VALUES (?, ?, ?, ?, ?)',
        [firstName, lastName, email, username, hashedPassword]
      );

      res.redirect('login', { 
        message: 'Account created successfully! Please login.',
        errors: [] 
      });
    } catch (err) {
      console.error('Error:', err);
      res.status(500).render('signup', { 
        message: 'Something went wrong, please try again.',
        errors: [] 
      });
    }
  }
);

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
