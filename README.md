# justrox-tent
MEAN stack API framework.
Automatically creates API endpoints for Mongoose models.

### Installation

```
npm install justrox-tent --save
```

### Getting Started 
#### 1. Creating a server
  ````js
  
  var app = require('express')();
  var tent = require('justrox-tent');
  
  /*
   ...
    Model definitions
    ....
  */
  
  //Initialize server
  tent.init(app,function()
  {
      app.listen(3000);
  });
  ````
#### 2. Defining models
  In this example we will create a user model.
  
  ```js
  const Model = tent.Model;
  
  //Create a new model
  const UserTentModel = Model.new("user");
  
  //Define the model.  
  UserTentModel.define({
  
    //Define model schema. This is almost the same with mongoose schema definitions
    schema:
    {
      name: String,
      rank: Number
    }
    
    //Define model field permissions
    permissions:
    {
       _id: 1,
       name: 7,   // readable, writable, editable - See permissions below
       rank: 1,   // read only field
    },
    
    //Define the required fields for the model
    required: ["name"]
    
  });
  
  
  //Compile the model. Once compiled the mongoose model will become available.
  UserTentModel.compile();
  ```
#### 3. Accessing model
  Once `tent.init()` has been called, the API routes will be available at `[host]:[port]/api`
  
  3.1 List all documents for the user model defined above.
  ```
  [GET] /api/user
  ```
  3.2 Get a specific document with id=5cc7c58ac657d641ecadea34
  ```
  [GET] /api/user/5cc7c58ac657d641ecadea34
  ```
  3.3 Add new document
  ```
  [POST] /api/user
  ```
  3.4 Edit a document
  ```
  [PUT] /api/user/5cc7c58ac657d641ecadea34
  ```
  3.5 Delete a document
  ```
  [DELETE] /api/user/5cc7c58ac657d641ecadea34
  ```

#### 4. Customization
...


#####  4.1 Permissions
...

#####  4.2 Mongoose Models
...

###### 4.2.1 Virtual Fields
...

 ###### 4.2.2 Populate Fields
... 
 ######  4.2.3 Methods
...

#####  4.3 Custom Routes
...  
 
 ######  4.3.1 Override routes
...

 ######  4.3.2 Routes API
...

 ######  4.3.3 Extend routes
...

 ######  4.3.4 Child endpoint routes 
...
