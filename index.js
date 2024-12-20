




const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// Config
require('dotenv').config()
const app = express()
const port = process.env.PORT || 3000

// MiddleWare   
app.use(cors());
app.use(express.json())
                    
              
const uri = `mongodb+srv://${process.env.USERNAME}:${process.env.PASSWORD}@cluster0.uc340vx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`

// Create a MongoClient with a MongoClientOptions object to set the Stable API version     
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
                    
                                        
async function run() {
  try {
    const MatchInfo = client.db('MatchDB').collection('MatchLists')
    

    app.get('/matches', async(req, res)=>{
        const cursor = MatchInfo.find()
        const result = await cursor.toArray()
        res.send(result)
     
      })

     
      app.post('/matches', async(req, res)=>{
        const match = req.body;
        const result = await MatchInfo.insertOne(match)
        res.send(result)
      })

      app.post('/matches/:id', async (req, res) => {
        const id = req.params.id; // ID of the match to update
        const newData = req.body; // Data to be added

        // console.log(id, active); 
        // console.log(newData.type === "bowler")
      
        const filter = { _id: new ObjectId(id) };
      
     
      
        // Optionally, you can also push new data into the batter array, if needed
        if (newData.type === "bowler") {
          updateDoc = {
              $push: {
                  bowler: newData
              }
          };
      } else { 
          updateDoc = {
              $push: {
                  batter: newData
              }
          };
      }
      
        // Perform the update operation for pushing new data into the array
        const result = await MatchInfo.updateOne(filter, updateDoc, { upsert: false });
      
        res.send({ success: true, modifiedCount: result.modifiedCount });
      });
       
//  Total and batter-bawlers runs update                                          
   
app.put("/matches/:matchId", async (req, res) => {
  const { matchId } = req.params;
  const { incrementValue = 0, ballIncrement = 0, teamBall=0, incrementOver = 0 } = req.body;

  console.log("Input Data:", { teamBall, ballIncrement, incrementOver, incrementValue });

  if (!ObjectId.isValid(matchId)) {
    return res.status(400).json({ success: false, message: "Invalid Match ID format" });
  }

  if (typeof incrementValue !== "number") {
    return res.status(400).json({ success: false, message: "Invalid increment value" });
  }

  if (typeof ballIncrement !== "number") {
    return res.status(400).json({ success: false, message: "Invalid ball increment value" });
  }

  try {
    // Prepare the update fields
    const updateFields = {
      $inc: {
        teamTotal: incrementValue, // Update team's total runs
        teamOver: incrementOver,  // Update team's overs
        "batter.$[strikingBatter].run": incrementValue, // Update batter's runs
        "batter.$[strikingBatter].ball": ballIncrement || (incrementValue !== 0 ? 1 : 0), // Update batter's balls faced
        "bowler.$[strikingBowler].Runs": incrementValue, // Update bowler's runs given
        "bowler.$[strikingBowler].Over": incrementOver, // Update bowler's overs
        teamBall: ballIncrement, // Update team's balls
      },
    };

    // Handle boundary increments (4s and 6s)
    if (incrementValue === 4) {
      updateFields.$inc["batter.$[strikingBatter].fours"] = 1;
    }
    if (incrementValue === -4) {
      updateFields.$inc["batter.$[strikingBatter].fours"] = -1;
    }
    if (incrementValue === 6) {
      updateFields.$inc["batter.$[strikingBatter].sixes"] = 1;
    }
    if (incrementValue === -6) {
      updateFields.$inc["batter.$[strikingBatter].sixes"] = -1;
    }
      
    // If the total number of team balls crosses 6, reset teamBall and increment overs
    if (teamBall + ballIncrement >= 6) {
      updateFields.$set = { teamBall: 0 }; // Reset teamBall
    }

    // Execute the update query
    const result = await MatchInfo.updateOne(
      { _id: new ObjectId(matchId) },
      updateFields,
      {
        arrayFilters: [
          { "strikingBatter.strike": true }, // Filter for the batter on strike
          { "strikingBowler.strike": true }, // Filter for the bowler on strike
        ],
      }
    );

    if (result.modifiedCount > 0) {
      res.send({ success: true, modifiedCount: result.modifiedCount });
    } else {
      res.status(404).json({ success: false, message: "Match or active batter/bowler not found" });
    }
  } catch (error) {
    console.error("Error updating match data:", error);
    res.status(500).json({ success: false, error: "An error occurred while updating match data" });
  }
});
 

// Delete Match

app.delete('/matches/:id', async (req, res) => {
  const id = req.params.id; // ID of the match to update
  const filter = { _id: new ObjectId(id) };
  const result = await MatchInfo.deleteOne(filter)
  res.send(result)
})
 
app.put('/matches/:id/:batterid', async (req, res) => {
  const matchId = req.params.id; // Match document ID
  const batterId = req.params.batterid; // Batter ID
  const { active, increamentWicket = 0, wicket } = req.body; // Added `wicket` to request body

  try {
    // Check if the document matches the query
    const matchedDocument = await MatchInfo.findOne({
      _id: new ObjectId(matchId),
      "batter.id": batterId,
    });

    if (!matchedDocument) {
      return res.status(404).json({
        message: "Match or batter not found. Update aborted.",
      });
    }

    // Build the update query
    const updateQuery = {
      $set: {
        "batter.$[elem].active": active,
      },
      $inc: {
        teamWicket: increamentWicket,
      },
    };

    // Add ball increment for the striking batter
    if (wicket !== "runOut") {
      updateQuery.$inc = {
        ...updateQuery.$inc, // Keep the previous increment logic
        "batter.$[strikingBatter].ball": 1, // Increment the ball for the batter with strike: true
        "bowler.$[bowlerElem].Wicket": increamentWicket, // Increment bowler's Wicket if not "runOut"
      };
    }

    // Array filters to target the batter and active bowler
    const arrayFilters = [
      { "elem.id": batterId }, // Filter for the batter
    ];

    // Add the filter for the striking batter (if necessary)
    if (wicket !== "runOut") {
      arrayFilters.push({ "strikingBatter.strike": true }); // Filter for the batter on strike
      arrayFilters.push({ "bowlerElem.strike": true }); // Only add bowler filter when needed
    }

    // Perform the update
    const result = await MatchInfo.updateOne(
      { _id: new ObjectId(matchId) },
      updateQuery,
      {
        arrayFilters,
      }
    );

    if (result.modifiedCount > 0) {
      return res.json({ success: true, modifiedCount: result.modifiedCount });
    } else {
      return res.status(404).json({
        message: "No document was modified.",
      });
    }
  } catch (error) {
    console.error("Error updating batter and teamWicket:", error);
    return res.status(500).json({
      error: "An error occurred while updating the batter and bowler data.",
    });
  }
});
 
            
      

app.get('/matches/:id?', async (req, res) => {
    const id = req.params.id;
    if (id) {
      // Fetch a specific match by ID
      const match = await MatchInfo.findOne({ _id: new ObjectId(id) });
      res.send(match);
    } else {
      // Fetch all matches if no ID is provided
      const matches = await MatchInfo.find().toArray();
      res.send(matches);
    }
});



// Batter Strike changes
app.put("/matches/:matchId/batter/:batterId/strike", async (req, res) => {
  const { matchId, batterId } = req.params;

  // Validate IDs
  if (!ObjectId.isValid(matchId)) {
    return res.status(400).json({ success: false, message: "Invalid Match ID format" });
  }

  try {
    // Update the strike for the selected batter and reset for others
    const result = await MatchInfo.updateOne(
      { _id: new ObjectId(matchId) }, // Find the match by ID
      {
        $set: { "batter.$[selected].strike": true }, // Set strike true for the selected batter
        $unset: { "batter.$[other].strike": "" }, // Remove strike for all other batters
      },
      {
        arrayFilters: [
          { "selected.id": batterId }, // Match the selected batter by ID
          { "other.id": { $ne: batterId } }, // Exclude the selected batter
        ],
      } 
    );
              
    if (result.modifiedCount > 0) {
      return res.status(200).json({ success: true, message: "Strike updated successfully" });
    } else {
      return res
        .status(404)
        .json({ success: false, message: "Match or batter not found" });
    }
  } catch (error) {
    console.error("Error updating strike:", error);
    res.status(500).json({ success: false, error: "An error occurred while updating strike" });
  }
});

  // Bowler Strike changes
  app.put("/matches/:matchId/bowler/:bowlerId/strike", async (req, res) => {
  const { matchId, bowlerId } = req.params;

  // Validate IDs
  if (!ObjectId.isValid(matchId)) {
    return res.status(400).json({ success: false, message: "Invalid Match ID format" });
  }

  try {
    // Update the strike for the selected batter and reset for others
    const result = await MatchInfo.updateOne(
      { _id: new ObjectId(matchId) }, // Find the match by ID
      {
        $set: { "bowler.$[selected].strike": true }, // Set strike true for the selected batter
        $unset: { "bowler.$[other].strike": "" }, // Remove strike for all other batters
      },
      {
        arrayFilters: [
          { "selected.id": bowlerId }, // Match the selected batter by ID
          { "other.id": { $ne: bowlerId } }, // Exclude the selected batter
        ],
      }
    );
              
    if (result.modifiedCount > 0) {
      return res.status(200).json({ success: true, message: "Strike updated successfully" });
    } else {
      return res
        .status(404)
        .json({ success: false, message: "Match or batter not found" });
    }
  } catch (error) {
    console.error("Error updating strike:", error);
    res.status(500).json({ success: false, error: "An error occurred while updating strike" });
  }
});

// update extra portion
app.put('/extra/:id', async (req, res) => {
  const { id } = req.params; // Route parameter fix
  const { incrementValue = 0, extra } = req.body; // Default values

  // Input Validation
  if (typeof incrementValue !== "number") {
    return res.status(400).json({ success: false, message: "Invalid increment value" });
  }

  try {
    // Initialize the updateFields object
    const updateFields = {
      $inc: {
        teamTotal: incrementValue, // Increment team total
        "bowler.$[strikingBowler].Runs": incrementValue, // Add runs to bowler
        extra: incrementValue
      },
    };

    // Conditionally add specific "extra" fields dynamically
    if (extra === "wide") {
      updateFields.$inc.wide = incrementValue; // Wide runs
    } else if (extra === "noBall") {
      updateFields.$inc.noBall = incrementValue; // No-ball runs
    } else if (extra === "legBye") {
      updateFields.$inc.legbye = incrementValue; // Leg bye runs
    } else if (extra === "bye") {
      updateFields.$inc.bye = incrementValue; // Bye runs
    }

    // Database update logic
    const result = await MatchInfo.updateOne(
      { _id: new ObjectId(id) }, // Match the document by ID
      updateFields,
      { arrayFilters: [{ "strikingBowler.strike": true }] } // Optional for specific bowler update
    );

    // Success Response
    if (result.modifiedCount > 0) {
      res.send({ success: true, modifiedCount: result.modifiedCount });
    } else {
      res.status(404).json({ success: false, message: "Match not found or no changes made" });
    }
  } catch (error) {
    console.error("Error updating match data:", error);
    res.status(500).json({ success: false, error: "An error occurred while updating match data" });
  }
});
      
      
             
      
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello World!')
})
       
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})   