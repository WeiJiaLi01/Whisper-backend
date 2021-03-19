require('dotenv').config()
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require('express-session');
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate = require('mongoose-findorcreate');

const app = express();

app.use(express.static("public"));

app.set('view engine', 'ejs');

app.use(bodyParser.urlencoded({
  extended: true
}));

app.use(session({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: false
}))

app.use(passport.initialize());

app.use(passport.session());

mongoose.connect("mongodb://localhost:27017/userDB", { useNewUrlParser: true, useUnifiedTopology: true });
mongoose.set('useCreateIndex', true);

const likeSchema = new mongoose.Schema({
  count: Number
})

const dislikeSchema = new mongoose.Schema({
  count: Number
})

const commentSchema = new mongoose.Schema({
  comment: String
})

const userSchema = new mongoose.Schema({
  account: String,
  email: String,
  password: String,
  googleId: String,
  secret: [{ 
    singleSecret: String, 
    like: likeSchema,
    dislike: dislikeSchema,
    comments: [commentSchema]}]
});

userSchema.plugin(passportLocalMongoose);

userSchema.plugin(findOrCreate);

const User = new mongoose.model("User", userSchema);

passport.use(User.createStrategy());

passport.serializeUser(function (user, done) {
  done(null, user.id);
});

passport.deserializeUser(function (id, done) {
  User.findById(id, function (err, user) {
    done(err, user);
  });
});

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "http://localhost:3000/auth/google/secrets"
},
  function (accessToken, refreshToken, profile, cb) {
    User.findOrCreate({ googleId: profile.id }, function (err, user) {
      return cb(err, user);
    });
  }
));

app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile'] })
);

app.get('/auth/google/secrets',
  passport.authenticate('google', { failureRedirect: '/login' }),
  function (req, res) {
    res.redirect('/secrets');
  }
);

app.get("/", function (req, res) {
  res.render("index")
})

app.get("/signin", function (req, res) {
  if (req.isAuthenticated()) {
    res.redirect("secrets")
  } else {
    res.render("signin")
  }
})

app.get("/signup", function (req, res) {
  if (req.isAuthenticated()) {
    res.redirect("secrets")
  } else {
    res.render("signup")
  }
})

app.get("/signout", function (req, res) {
  req.logout();
  res.redirect("/signin");
})

app.post("/signup", function (req, res) {
  const account = req.body.account;
  const email = req.body.username;
  const password = req.body.password;
  User.register({ account: account, username: email, active: false }, password, function (err, user) {
    if (err) {
      console.log(err);
      res.redirect("/signup");
    } else {
      passport.authenticate("local")(req, res, function () {
        res.redirect("/secrets");
      })
    };
  });
});

app.get("/secrets", function (req, res) {
  User.find({ "secret": { $gt: [] } }, function (err, foundUsers) {
    if (err) {
      console.log(err);
    } else {
      if (foundUsers) {
        if (req.isAuthenticated()) {
          res.render("secrets", { usersWithSecrets: foundUsers, flag: "true" });
        } else {
          res.render("secrets", { usersWithSecrets: foundUsers, flag: "false" });
        }
      }
    }
  });
});

app.get("/mysecrets", function (req, res) {

  if (req.isAuthenticated()) {
    User.findById(req.user.id, function (err, foundUser) {
      if (err) {
        console.log(err);
      } else {
        if (foundUser) {
          res.render("mysecrets", { user: foundUser});
        }
      }
    })
  } else {
    res.render("signin")
  }
});

app.get("/submit", function (req, res) {
  if (req.isAuthenticated()) {
    res.render("submit");
  } else {
    res.redirect("/signin");
  }
})

app.post("/submit", function (req, res) {
  const submittedSecret = {
    singleSecret: req.body.secret
  }
  User.findById(req.user.id, function (err, foundUser) {
    if (err) {
      console.log(err);
    } else {
      if (foundUser) {
        foundUser.secret.push(submittedSecret);
        foundUser.save(function () {
          res.redirect("/mysecrets");
        })
      }
    }
  })
})

app.post("/signin", function (req, res) {
  const user = new User({
    username: req.body.username,
    password: req.body.password
  })
  req.login(user, function (err) {
    if (err) {
      console.log(err);
    } else {
      // here wrong
      // how to check the username or password is empty
      // or is wrong
      passport.authenticate("local")(req, res, function () {
        res.redirect("/secrets");
      })
    }
  })
})

app.post("/delete", function (req, res) {
  const postID = req.body.postID;
  User.findById(req.user.id, function (err, foundUser) {
    if (err) {
      console.log(err);
    } else {
      if (foundUser) {
        const newSecret = foundUser.secret.filter(function (e) {
          return e.id != postID;
        });
        foundUser.secret = newSecret;
        foundUser.save(function () {
          res.redirect("/mysecrets");
        })
      }
    }
  })
});

app.post("/modify", function (req, res) {
  const postID = req.body.postID;
  const postContent = req.body.postContent;
  res.render("update", {postID: postID, postContent: postContent});
});

app.post("/update", function(req, res){

  const newPost = {
    id: req.body.postID,
    singleSecret: req.body.newSecret
  }

  User.findById(req.user.id, function (err, foundUser) {
    if (err) {
      console.log(err);
    } else {
      if (foundUser) {
        const modifyPost = foundUser.secret.filter(function (e) {
          return e.id != req.body.postID;
        });
        modifyPost.push(newPost);
        foundUser.secret = modifyPost;
        foundUser.save(function () {
          res.redirect("/mysecrets");
        })
      };
    };
  });
})

app.post("/like", function(req, res){
  console.log(req.body);
  // 1. 加like, dislike : 点击按钮，实现数字的变化
  // 2. 点击comment，进入评论页面，评论然后评论数目增加
  // 3. 可以看到实时的评论，可以返回之前的页面
})

app.listen(3000, function () {
  console.log("Server started on port 3000.");
});