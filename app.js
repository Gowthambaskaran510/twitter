const express = require("express");

const app = express();

app.use(express.json());

const path = require("path");

const { open } = require("sqlite");

const sqlite3 = require("sqlite3");

const bcrypt = require("bcrypt");

const jwt = require("jsonwebtoken");

const databasePath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error : ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

// Getting USER Following people id's

const getFollowingPeopleIdsUser = async (username) => {
  const getTheFollowingPeopleUser = `
          SELECT 
            following_user_id 

          FROM 
              follower

          INNER JOIN user ON user.user_id =  follower.follower_user_id

          WHERE 
              user.username= '${username}';`;

  const followingPeople = await db.all(getFollowingPeopleIdsUser);
  const arraysOfId = followingPeople.map(
    (eachUser) => eachUser.following_user_id
  );

  return arraysOfId;
};

//authentication Token

const authentication = (request, response, next) => {
  let jwtToken;

  const authHeader = request.headers["authorization"];

  if (authHeader) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken) {
    jwt.verify(jwtToken, "SECRET_KEY", (error, payload) => {
      if (error) {
        response.status(401).send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        request.userId = payload.userId;
        next();
      }
    });
  } else {
    response.status(401).send("Invalid JWT Token");
  }
};

const tweetAccessVerification = async (request, response, next) => {
  const { userId } = request;
  const { tweetId } = request.params;

  const getTweetQuery = `
                SELECT 
                    *
                FROM 
                    tweet 
                    
                INNER JOIN follower ON 

                   tweet.user_id = follower.follower_user_id

                WHERE
                
                tweet.tweet_id = "${tweetId}" AND follower_user_id = '${userId}';`;

  const tweet = await db.get(getTweetQuery);

  if (tweet === undefined) {
    response.status(401).send("Invalid Request");
  } else {
    next();
  }
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;

  const getUserQuery = `
                   
                 SELECT *
                 
                 FROM user

                 WHERE 
                      
                   username ='${username}'`;

  const userDbDetails = await db.get(getUserQuery);

  if (userDbDetails !== undefined) {
    response.status(400).send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400).send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);

      const createUserQuery = `
                         INSERT INTO 
                                user(username,password,name,gender)

                          VALUES 
                               ('${username}',
                               '${hashedPassword}',
                               '${name}',
                               '${gender}')`;

      await db.run(createUserQuery);
      response.send("User created successfully");
    }
  }
});

//API 1

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const selectUserQuery = `

SELECT 
*
FROM 
user
WHERE 
username ='${username}';`;

  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);

    if (isPasswordMatched === true) {
      const payload = { username, userId: dbUser.user_Id };
      const jwtToken = jwt.sign(payload, "SECRET_KEY");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// API 3
app.get("/user/tweets/feed/", authentication, async (request, response) => {
  const { userId } = request;

  const followingPeopleIds = await getFollowingPeopleIdsUser(userId);

  const followingPeopleIdsStr = followingPeopleIds.join(", ");

  const getTweetsQuery = `
        SELECT  
           tweet.tweet_id,
           user.username,
           tweet.tweet,
           tweet.date_time AS dateTime
        FROM 
           tweet
        INNER JOIN user ON user.user_id = tweet.user_id
        WHERE 
           user.user_id IN (${followingPeopleIdsStr})
        ORDER BY 
           tweet.date_time DESC
        LIMIT 4 ;`;

  const tweets = await db.all(getTweetsQuery);
  response.send(tweets);
});

//API 4

app.get("/user/following/", authentication, async (request, response) => {
  const { username, userId } = request;

  const getFollowingUserQuery = `
        SELECT  
         
           name

        FROM 
            follower

        INNER JOIN user ON user.user_id =  follower.following_user_id

         
        WHERE 
           follower_user_id ="${userId}";`;

  const followingPeople = await db.all(getFollowingUserQuery);
  response.send(followingPeople);
});

// API 5

app.get("/user/followers/", authentication, async (request, response) => {
  const { userId } = request;

  const getFollowerQuery = `
        SELECT  
         
           DISTINCT name

        FROM 
            follower

        INNER JOIN user ON user.user_id =  follower.follower_user_id

         
        WHERE 
           follower_user_id ="${userId}";`;

  const followers = await db.all(getFollowerQuery);
  response.send(followers);
});

//API 6

app.get(
  "/tweets/:tweetId/",
  authentication,
  tweetAccessVerification,
  async (request, response) => {
    const { username, userId } = request;
    const { tweetId } = request.params;

    const getTweetQuery = `SELECT tweet, 
       (SELECT COUNT() 
       
        FROM like 

        WHERE 
          
          tweet_id = "${tweetId}") AS likes,

        (SELECT COUNT() 
       
        FROM replay

        WHERE 
          
          tweet_id = "${tweetId}") AS replies,
          
        date_time AS dateTime
        
        
        FROM 

          tweet 

        WHERE 
          
          tweet.tweet_id = "${tweetId}" ;`;

    const tweet = await db.all(getTweetQuery);
    response.send(tweet);
  }
);

// API 7

app.get(
  "/tweets/:tweetId/likes/",
  authentication,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const getLikesQuery = `SELECT username
     FROM user
     INNER JOIN likes ON user.user_id = likes.user_id
     WHERE likes.tweet_id = "${tweetId}";`;

    const likesUser = await db.all(getLikesQuery);
    const userArray = likesUser.map((eachUser) => eachUser.username);
    response.send({ likes: userArray });
  }
);

//API 8

app.get(
  "/tweets/:tweetId/replies/",
  authentication,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;

    const getRepliesQuery = `SELECT name, reply    
        
        FROM 

         user

         INNER JOIN reply ON user.user_id =  reply.user_id


        WHERE 
          
          tweet.tweet_id = "${tweetId}" ;`;

    const replyUser = await db.all(getRepliesQuery);
    response.send({ reply: replyUser });
  }
);

// API 9

app.get("/user/tweets/", authentication, async (request, response) => {
  const { userId } = request;

  const getTweetsQuery = `SELECT tweet ,
       COUNT (DISTINCT like_id)  as likes,
       COUNT (DISTINCT reply_id)  as reply,
       date_time AS dateTime  

        
        FROM 

        tweet

         LEFT JOIN reply ON tweet.tweet_id =  reply.tweet_id
         LEFT JOIN like ON tweet.tweet_id =  like.tweet_id


        WHERE 
          
          tweet.user_id = "${userId}" 
          
          
          GROUP BY 
                tweet.tweet_id
                ORDER BY 
                date_time DESC;`;

  const tweets = await db.all(getTweetsQuery);
  response.send(tweets);
});

//API 10

app.post("/user/tweets/", authentication, async (request, response) => {
  const { tweet } = request.body;
  const userId = parseInt(request.userId);

  const dateTime = new Date().toJSON().substring(0, 19).replace("T", " ");

  const createTweetsQuery = `INSERT INTO 
                                tweet(tweet, user_id, date_time)

                          VALUES 
                               ("${tweet}",
                               "${userId}",
                               "${dateTime}";)`;

  await db.run(createTweetsQuery);
  response.send("Created a Tweet");
});

// API 11 - Delete Tweet
app.delete("/tweets/:tweetId/", authentication, async (request, response) => {
  const { tweetId } = request.params;
  const { userId } = request;

  const getTheTweetQuery = `
    SELECT *
    FROM tweet
    WHERE user_id = "${userId}" AND tweet_id = ${tweetId};
  `;

  const tweet = await db.get(getTheTweetQuery);

  if (tweet === undefined) {
    response.status(401).send("Invalid Request");
  } else {
    const deleteTweetQuery = `
      DELETE FROM tweet
      WHERE tweet_id = ${tweetId};
    `;

    await db.run(deleteTweetQuery);
    response.send("Tweet Removed");
  }
});

module.exports = app;
