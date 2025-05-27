const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

// Replace with your bot token
const token = "7636521733:AAHXEsL5zM0X1nTWBlU3mdYrBkywOGzdsa8";

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, { polling: true });

// Load questions from the questions.json file
let questions;
try {
  const data = fs.readFileSync("questions.json", "utf8");
  questions = JSON.parse(data);
} catch (error) {
  console.error("Error loading questions.json:", error.message);
  process.exit(1); // Exit the bot if questions.json is invalid
}

// Store user sessions
const userSessions = {};

// Handle the /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    "Welcome to the Quiz Bot! Type /quiz to start the quiz."
  );
});

// Update the /quiz command to include course selection
bot.onText(/\/quiz/, (msg) => {
  const chatId = msg.chat.id;

  // Send course selection buttons
  bot.sendMessage(chatId, "Choose a course:", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "CT", callback_data: "course_CT" },
          { text: "PP", callback_data: "course_PP" },
        ],
      ],
    },
  });
});

// Function to send a question
function sendQuestion(chatId) {
  const session = userSessions[chatId];
  const question = questions[session.currentQuestionIndex];

  // Convert options object to an array of { key, value } pairs
  const optionsArray = Object.entries(question.options);

  // Construct the message with the full question and options
  let messageText = `📖 [${session.currentQuestionIndex + 1}/${
    questions.length
  }] ${question.question}\n\n`;
  optionsArray.forEach(([key, value]) => {
    messageText += `🔹 ${key.toUpperCase()}) ${value}\n`;
  });

  bot.sendMessage(chatId, messageText, {
    reply_markup: {
      inline_keyboard: [
        optionsArray.map(([key]) => ({
          text: key.toUpperCase(),
          callback_data: `answer_${session.currentQuestionIndex}_${key}`,
        })),
        [
          {
            text: "⏭️ Skip",
            callback_data: `skip_${session.currentQuestionIndex}`,
          },
          {
            text: "❌ End Quiz",
            callback_data: `end_${session.currentQuestionIndex}`,
          },
        ],
      ],
    },
  });
}

// Handle callback queries (answers and navigation)
bot.on("callback_query", (callbackQuery) => {
  const message = callbackQuery.message;
  const data = callbackQuery.data;
  const chatId = message.chat.id;

  // Parse the callback data
  const [action, param1, param2] = data.split("_");

  if (action === "course") {
    // Handle course selection
    const course = param1;

    bot.sendMessage(chatId, `You selected ${course}. Choose a category:`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Lectures", callback_data: `category_${course}_lectures` },
            { text: "Final", callback_data: `category_${course}_final` },
          ],
        ],
      },
    });
  } else if (action === "category") {
    // Handle category selection
    const course = param1;
    const category = param2;

    if (category === "lectures") {
      const lectureOptions =
        course === "CT"
          ? [
              [
                { text: "1", callback_data: `lecture_${course}_1` },
                { text: "2", callback_data: `lecture_${course}_2` },
                { text: "3", callback_data: `lecture_${course}_3` },
                { text: "4", callback_data: `lecture_${course}_4` },
              ],
              [
                { text: "5", callback_data: `lecture_${course}_5` },
                { text: "6", callback_data: `lecture_${course}_6` },
                { text: "7", callback_data: `lecture_${course}_7` },
              ]
            ]
          : [
              [
                { text: "1", callback_data: `lecture_${course}_1` },
                { text: "2", callback_data: `lecture_${course}_2` },
                { text: "3", callback_data: `lecture_${course}_3` },
              ],
            ];

      bot.sendMessage(
        chatId,
        `You selected ${course} Lectures. Choose a lecture number:`,
        {
          reply_markup: {
            inline_keyboard: lectureOptions,
          },
        }
      );
    } else if (category === "final") {
      const filePath = `${course}_final.json`;

      // Load questions dynamically for the final exam
      try {
        const data = fs.readFileSync(filePath, "utf8");
        questions = JSON.parse(data);

        // Initialize user session
        userSessions[chatId] = {
          currentQuestionIndex: 0,
          score: 0,
        };

        // Send the first question
        sendQuestion(chatId);
      } catch (error) {
        bot.sendMessage(
          chatId,
          `Error loading questions for ${course} final exam: ${error.message}`
        );
      }
    }
  } else if (action === "lecture") {
    // Handle lecture selection
    const course = param1;
    const lectureNumber = param2;
    const filePath = `${course}_lecture_${lectureNumber}.json`;

    // Load questions dynamically for the selected lecture
    try {
      const data = fs.readFileSync(filePath, "utf8");
      questions = JSON.parse(data);

      // Initialize user session
      userSessions[chatId] = {
        currentQuestionIndex: 0,
        score: 0,
      };

      // Send the first question
      sendQuestion(chatId);
    } catch (error) {
      bot.sendMessage(
        chatId,
        `Error loading questions for ${course} lecture ${lectureNumber}: ${error.message}`
      );
    }
  } else if (action === "answer") {
    const session = userSessions[chatId]; // Get the session for the user
    // Ensure session exists before using it
    if (!session) {
      bot.sendMessage(chatId, "Session not found. Please start the quiz again.");
      return;
    }

    const question = questions[parseInt(param1, 10)];
    const isCorrect = param2 === question.correctOption;

    // Update score
    if (isCorrect) {
      session.score += 1;
    }

    // Construct feedback message
    let responseMessage = isCorrect
      ? `✅ Correct! 🎉\n\nExplanation: ${question.explanation}`
      : `❌ Wrong! The correct answer was: ${question.correctOption.toUpperCase()}) ${
          question.options[question.correctOption]
        }\n\nExplanation: ${question.explanation}`;

    responseMessage += `\n\n📊 Your current score: ${session.score}/${questions.length}`;

    bot.sendMessage(chatId, responseMessage).then(() => {
      // Move to the next question or end the quiz
      session.currentQuestionIndex += 1;

      if (session.currentQuestionIndex < questions.length) {
        sendQuestion(chatId);
      } else {
        bot.sendMessage(
          chatId,
          `🎉 Quiz completed! Your final score is: ${session.score}/${questions.length}`
        );
        delete userSessions[chatId]; // Clear session
      }
    });
  } else if (action === "skip") {
    const session = userSessions[chatId]; // Get the session for the user
    // Ensure session exists before using it
    if (!session) {
      bot.sendMessage(chatId, "Session not found. Please start the quiz again.");
      return;
    }

    // Skip to the next question
    session.currentQuestionIndex += 1;

    if (session.currentQuestionIndex < questions.length) {
      sendQuestion(chatId);
    } else {
      bot.sendMessage(
        chatId,
        `🎉 Quiz completed! Your final score is: ${session.score}/${questions.length}`
      );
      delete userSessions[chatId]; // Clear session
    }
  } else if (action === "end") {
    const session = userSessions[chatId]; // Get the session for the user
    // Ensure session exists before using it
    if (!session) {
      bot.sendMessage(chatId, "Session not found. Please start the quiz again.");
      return;
    }

    // End the quiz
    bot.sendMessage(
      chatId,
      `❌ Quiz ended! Your final score is: ${session.score}/${questions.length}`
    );
    delete userSessions[chatId]; // Clear session
  }
});

// Add error listener for debugging polling errors
bot.on("polling_error", (error) => {
  console.error("Polling error:", error);
});
