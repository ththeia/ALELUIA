const express = require('express')
const Sequelize = require('sequelize')
const cors = require('cors')
const { Op } = require("sequelize");

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: 'database.db',
  define: {
    timestamps: true
  }
})

// Entity definitions

const Activity = sequelize.define('activity', {
  id: {
    type: Sequelize.UUID,
    defaultValue: Sequelize.UUIDV4,
    primaryKey: true,
  },
  accessCode: {
    type: Sequelize.STRING,
  },
  description: Sequelize.STRING,
  date: Sequelize.DATE,
  validUntil: Sequelize.DATE,
})

const Feedback = sequelize.define('feedback', {
  id: {
    type: Sequelize.UUID,
    defaultValue: Sequelize.UUIDV4,
    primaryKey: true,
  },
  reaction: Sequelize.ENUM("smile", "frown", "surprised", "confused"),
  authorId: Sequelize.STRING,
},
{
  timestamps: true,
  createdAt: true,
  updatedAt: false, // feedback entries cannot be updated, so we do not need this field.
})

const User = sequelize.define('user', {
  firstName: Sequelize.STRING,
  lastName: Sequelize.STRING,
  username: {
    type: Sequelize.STRING,
    allowNull: false,
    unique: true,
  },
  password: Sequelize.STRING,
  role: {
    type: Sequelize.ENUM("student", "professor"),
    defaultValue: "student",
  },
}, {
  timestamps: false,
  defaultScope: {
    attributes: { exclude: ['password'] },
  }
})


const app = express()
app.use(cors())
app.use(express.json())

/// Activity endpoints ///

// Creates activity.
app.post('/activities', async (req, res) => {
  try {
    const newActivity = await Activity.create(req.body)
    res.status(201).json(newActivity)
  } catch (e) {
    console.warn(e)
    res.status(500).json({ message: e })
  }
})

// Gets all activities.
app.get('/activities', async (req, res) => {
  try {
    const activities = await Activity.findAll()
    res.status(200).json(activities)
  } catch (e) {
    console.warn(e)
    res.status(500).json({ message: e })
  }
})

// Gets all available activities.
app.get('/available-activities', async (req, res) => {
  try {
    const activities = await Activity.findAll({
      where: {
        [Op.and]: [
          {
            date: {
              [Op.lte]:sequelize.fn('datetime', 'now')
            }
          },
          {
            validUntil: {
              [Op.gte]:sequelize.fn('datetime', 'now')
            }
          }
        ]
      }
    });
    res.status(200).json(activities)
  } catch (e) {
    console.warn(e)
    res.status(500).json({ message: e })
  }
})

// Gets activity by code.
app.get('/activities/:code', async (req, res) => {
  try {
    const activity = await Activity.findByPk(req.params.code)
    if (activity) {
      res.status(200).json(activity)
    } else {
      res.status(404).json({ message: 'not found' })
    }
  } catch (e) {
    console.warn(e)
    res.status(500).json({ message: e })
  }
})

// Updates (edits) an activity.
app.put('/activities/:code', async (req, res) => {
  try {
    const activity = await Activity.findByPk(req.params.code)
    if (activity) {
      await activity.update(req.body)
      res.status(202).json({ message: 'accepted' })
    } else {
      res.status(404).json({ message: 'not found' })
    }
  } catch (e) {
    console.warn(e)
    res.status(500).json({ message: e })
  }
})

// Deletes an activity.
app.delete('/activities/:code', async (req, res) => {
  try {
    const activity = await Activity.findByPk(req.params.code)
    if (activity) {
      await activity.destroy()
      res.status(202).json({ message: 'accepted' })
    } else {
      res.status(404).json({ message: 'not found' })
    }
  } catch (e) {
    console.warn(e)
    res.status(500).json({ message: e })
  }
})

// Creates a new feedback instance for a given activity.
app.post('/activities/:code/feedback', async (req, res) => {
  try {
    const activity = await Activity.findByPk(req.params.code)
    if (activity) {
      const reaction = req.body.reaction;

      const newFeedback = await Feedback.create({
        activityCode: req.params.code,
        reaction: reaction,
      })

      res.status(201).json(newFeedback)
    } else {
      res.status(404).json({ message: 'not found' })
    }
  } catch (e) {
    console.warn(e)
    res.status(500).json({ message: e })
  }
})

// Get feedback for a given activity.
app.get('/activities/:code/feedback/:userId/:authorId', async (req, res) => {
  try {
    const activity = await Activity.findOne({
      where: {
        accessCode:req.params.code
      }
    })
    if (activity && req.params.userId && req.params.authorId) {
      
      const feedback = await Feedback.findAll({
        where: {
          [Op.and]: [
            {
              activityId: activity.id
            },
            {
              userId: req.params.userId
            },
            {
              authorId: req.params.authorId
            }
          ]
        }
      });

      res.status(200).json(feedback)
    } else {
      res.status(404).json({ message: 'not found' })
    }
  } catch (e) {
    console.warn(e)
    res.status(500).json({ message: e })
  }
})

app.get('/activities-count/:code/feedback/:userId', async (req, res) => {
  try {
    const activity = await Activity.findOne({
      where: {
        accessCode: req.params.code
      }
    });
    
    const user = await User.findOne({
      where: {
        username: req.params.userId
      }
    });
    if (activity && user) {
      console.log(req.params.userId);  
      const feedback = await Feedback.findAll({
        where: {
          activityId: activity.id,
          userId: user.id
        },
        attributes: ['reaction', [sequelize.fn('COUNT', 'reaction'), 'count']],
        group: ['reaction']
      });
      res.status(200).json(feedback);
    } else {
      res.status(404).json({ message: 'activity not found' });
    }
  } catch (e) {
    console.warn(e);
    res.status(500).json({ message: e });
  }
});


app.post('/feedback', async (req, res) => {
  try {
    // Get the user associated with the feedback
    const user = await User.findByPk(req.body.userId);
    const activity = await Activity.findByPk(req.body.activityId);

    // Create the new feedback
    const feedback = await Feedback.create({
      reaction: req.body.reaction,
      authorId: req.body.authorId,
    });

    // Associate the feedback with the user
    await user.addFeedback(feedback);
    await activity.addFeedback(feedback);

    res.status(201).json({ feedback });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



/// User endpoints ///

// Creates a new user.
app.post('/users', async (req, res) => {
  try {
    await User.create(req.body)
    res.status(201).json({ message: 'created' })
  } catch (e) {
    console.warn(e)
    res.status(500).json({ message: e })
  }
})

// Gets user by username.
app.get('/professors', async (req, res) => {
  try {
    const users = await User.findAll({
      where: {
        role: 'professor'
      }
    });

    if (users) {
      res.status(200).json(users)
    } else {
      res.status(404).json({ message: 'not found' })
    }
  } catch (e) {
    console.warn(e)
    res.status(500).json({ message: e })
  }
})

app.get('/users/:username', async (req, res) => {
  try {
    const user = await User.findOne({
      where: {
        username: req.params.username
      }
    })

    if (user) {
      res.status(200).json(user)
    } else {
      res.status(404).json({ message: 'not found' })
    }
  } catch (e) {
    console.warn(e)
    res.status(500).json({ message: e })
  }
})

// Log in.
app.post('/login', async (req, res) => {
  try {
    const user = await User.findOne({
      where: {
        username: req.body.username,
        password: req.body.password
      }
    })

    if (user) {
      res.status(200).json({ firstName: user.firstName, lastName: user.lastName, username: user.username, role: user.role })
    } else {
      res.status(404).json({ message: 'Incorrect user or password' })
    }
  } catch (e) {
    console.warn(e)
    res.status(500).json({ message: e })
  }
})


// Initialize server.
app.listen(8080, async () => {
  try {
    // Table associations
    Activity.hasMany(Feedback, {
      onDelete: 'CASCADE'
    });

    Feedback.belongsTo(Activity);

    User.hasMany(Feedback);
    Feedback.belongsTo(User);

    await sequelize.sync({alter: true,})
    console.warn('created tables')

    await User.findOrCreate({
      where: {
        firstName: "El", lastName: "Professor", username: "user1", password: "user1", role: "professor"
      }
    })

    await User.findOrCreate({
      where: {
        firstName: "Bob", lastName: "Stamina", username: "user2", password: "user2", role: "student"
      }
    })

    await Activity.findOrCreate({
      where: {
        accessCode: "ABC123",
        description: "Math 101",
        date: new Date(2022, 11, 31),
        validUntil: new Date(2023, 11, 31)
      }
    });

    await Activity.findOrCreate({
      where: {
        accessCode: "DEF456",
        description: "Physics 101",
        date: new Date(2022, 11, 31),
        validUntil: new Date(2023, 11, 31)
      }
    });

  } catch (err) {
    console.warn(err)
  }
})