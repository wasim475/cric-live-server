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
      updateFields.$push = { lastTen: 4 };
    }
    if (incrementValue === -4) {
      updateFields.$inc["batter.$[strikingBatter].fours"] = -1;
    }
    if (incrementValue === 6) {
      updateFields.$inc["batter.$[strikingBatter].sixes"] = 1;
      updateFields.$push = { lastTen: 6 };
    }
    if (incrementValue === -6) {
      updateFields.$inc["batter.$[strikingBatter].sixes"] = -1;
    }
      
    // If the total number of team balls crosses 6, reset teamBall and increment overs
    if (teamBall === 6) {
      updateFields.$set = { teamBall: 0 }; // Reset teamBall
    }
    if (incrementValue === 1) {
      updateFields.$push = { lastTen: 1 };
    }
    if (incrementValue === 2) {
      updateFields.$push = { lastTen: 2 };
    }
    if (incrementValue === 3) {
      updateFields.$push = { lastTen: 3 };
    }
    if (incrementValue === 0) {
      updateFields.$push = { lastTen: 0 };
    }
    if (incrementOver === 1) {
      updateFields.$push = { lastTen: "|" };
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

    // change the batter strike if incrementValue 1 and 3 or incrementOver 1

    if (incrementValue === 1 || incrementValue === 3 || incrementOver ===1) {
      try {
        // Step 1: Fetch the match document
        const matchData = await MatchInfo.findOne({ _id: new ObjectId(matchId) });
        if (!matchData) {
          return res.status(404).json({ success: false, message: "Match not found" });
        }
    
        const batters = matchData.batter;
    
        // Debugging logs to check batter data
        console.log("Batters Data:", batters);
    
        // Step 2: Identify the current striker
        const currentStriker = batters.find(b => b.active === true && b.strike === true);
    
        // Step 3: Identify the other active batter
        const nextStriker = batters.find(b => b.active === true && b.id !== currentStriker?.id);
    
        console.log("Current Striker:", currentStriker);
        console.log("Next Striker:", nextStriker);
    
        // Step 4: Update strike status
        if (currentStriker && nextStriker) {
          const strikeSwapResult = await MatchInfo.updateOne(
            { _id: new ObjectId(matchId) },
            {
              $set: {
                "batter.$[currentStriker].strike": false, // Current striker becomes non-striker
                "batter.$[nextStriker].strike": true, // Other active batter becomes striker
              },
            },
            {
              arrayFilters: [
                { "currentStriker.id": currentStriker.id }, // Match the current striker
                { "nextStriker.id": nextStriker.id }, // Match the next striker
              ],
            }
          );
    
          console.log("Strike Swap Result:", strikeSwapResult);
        } else {
          console.error("Error: Unable to find the next striker.");
          return res.status(400).json({ success: false, message: "Next striker missing." });
        }
      } catch (error) {
        console.error("Error swapping strike:", error);
        return res.status(500).json({ success: false, error: "Strike swap failed" });
      }
    }     

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

// Delete Matches

app.delete('/matches/:id', async (req, res) => {
  const id = req.params.id; // ID of the match to update
  const filter = { _id: new ObjectId(id) };
  const result = await MatchInfo.deleteOne(filter)
  res.send(result)
})

// Delete from LastTen    

app.delete('/matches/:id/lastten', async (req, res) => {
  const { id } = req.params; // Match ID
  const { index, extra } = req.body; // The index and the extra value to remove from lastTen

  // console.log('Removing item:', extra, 'at index:', index);



  try {
    // Fetch the current match document to get the lastTen array
    const match = await MatchInfo.findOne({ _id: new ObjectId(id) });
 

    // Get the current lastTen array
    const lastTenArray = match.lastTen;

    console.log('Current lastTen array:', lastTenArray);

    // Reverse the array to match the index being sent from the frontend
    const reversedArray = [...lastTenArray].reverse(); 

    // Check if the item at the specified reversed index matches the extra value
    if (reversedArray[index] === extra) {
      // Remove the item at that index in the original array
      lastTenArray.splice(lastTenArray.length - 1 - index, 1);  // Reverse the index back for removal
    } else {
      return res.status(400).json({ success: false, message: "Item at the specified index does not match the extra value" });
    }

    // Update the document with the modified lastTen array
    const result = await MatchInfo.updateOne(
      { _id: new ObjectId(id) },
      { $set: { lastTen: lastTenArray } } // Set the modified array
    );

    if (result.modifiedCount > 0) {
      res.send({ success: true, modifiedCount: result.modifiedCount });
    } else {
      res.status(404).json({ success: false, message: "No changes made to lastTen" });
    }
  } catch (error) {
    console.error("Error removing from lastTen:", error);
    res.status(500).json({ success: false, error: "An error occurred while removing from lastTen" });
  }
});
 
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

    if (increamentWicket > 0) {
      updateQuery.$push = {
        lastTen: "w",
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

// update extra run portion
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
      if(extra === "wide" && incrementValue ===1){
        updateFields.$push = { lastTen: "wd" };
      }
      if(extra === "wide" && incrementValue ===2){
        updateFields.$push = { lastTen: "2wd" };
      }
      if(extra === "wide" && incrementValue ===3){
        updateFields.$push = { lastTen: "3wd" };
      }
      if(extra === "wide" && incrementValue ===4){
        updateFields.$push = { lastTen: "4wd" };
      }
      if(extra === "wide" && incrementValue ===5){
        updateFields.$push = { lastTen: "5wd" };
      }
    } 
    else if (extra === "noBall") {
      updateFields.$inc.noBall = incrementValue; // No-ball runs
      updateFields.$push = { lastTen: "nb+" };
    } else if (extra === "legBye") {
      updateFields.$inc.legbye = incrementValue; // Leg bye runs
      if(extra === "legBye" && incrementValue ===1){
        updateFields.$push = { lastTen: "1lb" };
      }
      if(extra === "legBye" && incrementValue ===2){
        updateFields.$push = { lastTen: "2lb" };
      }
      if(extra === "legBye" && incrementValue ===3){
        updateFields.$push = { lastTen: "3lb" };
      }
      if(extra === "legBye" && incrementValue ===4){
        updateFields.$push = { lastTen: "4lb" };
      }
      
    } else if (extra === "bye") {
      updateFields.$inc.bye = incrementValue; // Bye runs
      if(extra === "bye" && incrementValue ===1){
        updateFields.$push = { lastTen: "1b" };
      }
      if(extra === "bye" && incrementValue ===2){
        updateFields.$push = { lastTen: "2b" };
      }
      if(extra === "bye" && incrementValue ===3){
        updateFields.$push = { lastTen: "3b" };
      }
      if(extra === "bye" && incrementValue ===4){
        updateFields.$push = { lastTen: "4b" };
      }
      
    }

    // Database update logic
    const result = await MatchInfo.updateOne(
      { _id: new ObjectId(id) }, // Match the document by ID
      updateFields,
      { arrayFilters: [{ "strikingBowler.strike": true }] } // Optional for specific bowler update
    );

   // Batter strike change if wide2, wide4, bye1, bye3, lb1, lb3 incrementValue

if (
  (extra === "bye" && (incrementValue === 1 || incrementValue === 3)) ||
  (extra === "legBye" && (incrementValue === 1 || incrementValue === 3)) ||
  (extra === "wide" && (incrementValue === 2 || incrementValue === 4))
) {
  try {
    // Fetch the match document
    const matchData = await MatchInfo.findOne({ _id: new ObjectId(id) });
    if (!matchData) {
      return res.status(404).json({ success: false, message: "Match not found" });
    }

    const batters = matchData.batter;

    // Identify the current striker and the other active batter
    const currentStriker = batters.find(b => b.active === true && b.strike === true);
    const nextStriker = batters.find(b => b.active === true && b.id !== currentStriker?.id);

    if (currentStriker && nextStriker) {
      // Update strike status
      const strikeSwapResult = await MatchInfo.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            "batter.$[currentStriker].strike": false,
            "batter.$[nextStriker].strike": true,
          },
        },
        {
          arrayFilters: [
            { "currentStriker.id": currentStriker.id },
            { "nextStriker.id": nextStriker.id },
          ],
        }
      );
      console.log("Strike Swap Result:", strikeSwapResult);
    } else {
      console.error("Error: Unable to find the next striker.");
      return res.status(400).json({ success: false, message: "Next striker missing." });
    }
  } catch (error) {
    console.error("Error swapping strike:", error);
    return res.status(500).json({ success: false, error: "Strike swap failed" });
  }
}


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

// Update Bowler Name
     

app.put('/matches/:matchId/updatebowlername/:id', async (req, res) => {
  const { matchId, id } = req.params;
  const { updateName } = req.body; // Extract `name` from the request body

  if (!updateName) {
    return res.status(400).send({ error: "Name is required" });
  }

  const filter = { _id: new ObjectId(matchId), "bowler.id": id }; // Match the specific document and bowler
  const update = {
    $set: {
      "bowler.$.name": updateName, // Update the name of the matched bowler
    },
  };

  try {
    const result = await MatchInfo.updateOne(filter, update);

    if (result.modifiedCount > 0) {
      res.status(200).send({ success: true, message: "Bowler info updated successfully" });
    } else {
      res.status(404).send({ success: false, message: "Bowler not found or no changes made" });
    }
  } catch (error) {
    console.error("Error updating bowler info:", error);
    res.status(500).send({ success: false, message: "Internal server error" });
  }
});

// Update  Batter Name 

app.put('/matches/:matchId/updatebattername/:id', async (req, res) => {
  const { matchId, id } = req.params;
  const { updateName } = req.body; // Extract `name` from the request body

  if (!updateName) {
    return res.status(400).send({ error: "Name is required" });
  }

  const filter = { _id: new ObjectId(matchId), "batter.id": id }; // Match the specific document and batter
  const update = {
    $set: {
      "batter.$.name": updateName, // Update the name of the matched batter
    },
  };

  try {
    const result = await MatchInfo.updateOne(filter, update);

    if (result.modifiedCount > 0) {
      res.status(200).send({ success: true, message: "Batter info updated successfully" });
    } else {
      res.status(404).send({ success: false, message: "Batter not found or no changes made" });
    }
  } catch (error) {
    console.error("Error updating batter info:", error);
    res.status(500).send({ success: false, message: "Internal server error" });
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