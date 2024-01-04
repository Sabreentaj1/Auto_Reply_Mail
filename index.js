const { google } = require("googleapis");

/*The essential packages have been imported for the Gmail Auto Reply Bot:

1. The `googleapis` package, sourced from the `googleapis` module, equips the application with essential functionality for seamless interaction with various Google APIs, prominently featuring the Gmail API.

2. The `OAuth2` class, hailing from the `google.auth` module, plays a pivotal role in authenticating the application. It orchestrates the acquisition of access tokens crucial for executing requests towards the Gmail API. Notably, this class adeptly manages token refreshment and gracefully handles request retries when deemed necessary.*/

const {
  CLIENT_ID,
  CLEINT_SECRET,
  REDIRECT_URI,
  REFRESH_TOKEN,
} = require("./credentials");

/**1. Obtain the client ID, client secret, and redirect URI from the Google Cloud Console (https://console.developers.google.com) by creating a project and configuring its settings.

2. Generate the refresh token through the OAuth 2.0 Playground (https://developers.google.com/oauthplayground). Here, authorize the necessary scope API (https://mail.google.com) by providing the client ID and client secret in the API settings. After authorization, an authorization code will be generated.

3. Exchange the authorization code for a refresh token by navigating to the OAuth 2.0 Playground and clicking on the "Exchange authorization code for tokens" button. This action will provide you with the essential refresh token.

4. Import the obtained credentials by utilizing the `credentials.js` file in your application. Ensure that this file includes the client ID, client secret, redirect URI, and the acquired refresh token.*/


const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLEINT_SECRET,
  REDIRECT_URI
);
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

/*The implementation ensures that no duplicate replies are sent to any email by utilizing a `Set()` data structure. By employing a `Set` to keep track of the emails that have already received an auto-reply, the system guarantees that each qualifying email triggers only one auto-reply. This prevents the occurrence of duplicate responses to the same email at any point in the process.

*/
//handledEmails is used to keep track of users to whom auto-replies have already been sent, ensuring that each user receives only one response.
const handledEmails = new Set();

//Step 1. checks for new emails and sends replies .
async function checknewEmailsAndSendReplies() {
  try {
    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

    // Get the list of unread messages.
    const res = await gmail.users.messages.list({
      userId: "me",
      q: "is:unread",
    });
    const messages = res.data.messages;

    if (messages && messages.length > 0) {
      //Here fetch the complete message details.
      for (const message of messages) {
        const email = await gmail.users.messages.get({
          userId: "me",
          id: message.id,
        });

        // Extract the recipient email address and subject from the message headers.
        const from = email.data.payload.headers.find(
          (header) => header.name === "From"
        );
        const toHeader = email.data.payload.headers.find(
          (header) => header.name === "To"
        );
        const Subject = email.data.payload.headers.find(
          (header) => header.name === "Subject"
        );
        //who sends email extracted
        const From = from.value;
        //who gets email extracted
        const toEmail = toHeader.value;
        //subject of unread email
        const subject = Subject.value;
        console.log("email has come From", From);
        console.log("to Email", toEmail);
        //check if the user already been replied to
        if (handledEmails.has(From)) {
          console.log("Already replied to : ", From);
          continue;
        }
        // 2.send replies to Emails that have no prior replies
        // Check if the email has any replies.
        const thread = await gmail.users.threads.get({
          userId: "me",
          id: message.threadId,
        });

        //isolated the email into threads
        const replies = thread.data.messages.slice(1);

        if (replies.length === 0) {
          // Reply to the email.
          await gmail.users.messages.send({
            userId: "me",
            requestBody: {
              raw: await createReplyRaw(toEmail, From, subject),
            },
          });

          // Add a label to the email.
          const labelName = "onVacation";
          await gmail.users.messages.modify({
            userId: "me",
            id: message.id,
            requestBody: {
              addLabelIds: [await createLabelIfNeeded(labelName)],
            },
          });

          console.log("Sent reply to email:", From);
          //Add the user to handledEmails set
          handledEmails.add(From);
        }
      }
    }
  } catch (error) {
    console.error("Error occurred:", error);
  }
}

//this function is basically used to convert string to base64EncodedEmail format
async function createReplyRaw(from, to, subject) {
  const emailContent = `From: ${from}\nTo: ${to}\nSubject: ${subject}\n\nThank you for your message. I am  unavailable right now, but will respond as soon as possible...`;
  const base64EncodedEmail = Buffer.from(emailContent)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return base64EncodedEmail;
}

// 3.add a Label to the email and move the email to the label
async function createLabelIfNeeded(labelName) {
  const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
  // Check if the label already exists.
  const res = await gmail.users.labels.list({ userId: "me" });
  const labels = res.data.labels;

  const existingLabel = labels.find((label) => label.name === labelName);
  if (existingLabel) {
    return existingLabel.id;
  }

  // Create the label if it doesn't exist.
  const newLabel = await gmail.users.labels.create({
    userId: "me",
    requestBody: {
      name: labelName,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    },
  });

  return newLabel.data.id;
}

/*4.repeat this sequence of steps 1-3 in random intervals of 45 to 120 seconds*/
function getRandomInterval(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

//Setting Interval and calling main function in every interval of 45-120 seconds
setInterval(checknewEmailsAndSendReplies, getRandomInterval(45, 120) * 1000);

/*note on areas where your code can be improved.
Error Handling: Enhance error handling mechanisms for more robust error management.
Code Efficiency: Optimize code for handling larger email volumes efficiently.
Security: Ensure secure storage of sensitive information like client secrets and refresh tokens.
User-Specific Configuration: Allow users to customize configuration options, such as email filters and reply messages.
Time Monitoring: Improve scheduling by incorporating a cron jobs package for more precise email task timing.

*/
