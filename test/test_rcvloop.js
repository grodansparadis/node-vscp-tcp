// test.js
//
// Copyright © 2012-2020 Ake Hedman, Grodans Paradis AB
// <akhe@grodansparadis.com>
//
// Licence:
// The MIT License (MIT)
// [OSI Approved License]
//
// The MIT License (MIT)
//
// Copyright © 2012-2020 Ake Hedman, Grodans Paradis AB (Paradise of the Frog)
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
//
// Alternative licenses for VSCP & Friends may be arranged by contacting
// Grodans Paradis AB at info@grodansparadis.com, http://www.grodansparadis.com
//

const vscp_class = require('node-vscp-class');
const vscp_type = require('node-vscp-type');
const vscp = require('node-vscp');
const vscp_tcp_client = require('../src/vscptcp.js');

//var sleep = require('sleep');

let brun = true;    // Truer as long as we should stay in rcvloop

const testAsync = async () => {

    console.log("Connect to local VSCP daemon");
    console.log("============================");

    let vscpclient = new vscp_tcp_client(); 

    vscpclient.addEventListener((e) => {
      console.log("Event:", e);
    });

    vscpclient.on('connect', function() {
        console.log("---------------- CONNECT -------------------");
    });

    vscpclient.on('disconnect', function() {
        console.log("---------------- DISCONNECT -------------------");
    });

    vscpclient.on('timeout', function() {
        console.log("---------------- TIMEOUT -------------------");
    });

    vscpclient.on('error', function() {
        console.log("---------------- ERROR -------------------");
    });

    vscpclient.on('event', function(ev) {
        console.log("---------------- EVENT -------------------");
    });

    vscpclient.on('alive', function() {
        console.log("---------------- ALIVE -------------------");
    });
  
    let userResponse = {};

    // Connect to VSCP server/device
    userResponse = await vscpclient.connect(
      {
        host: "192.168.1.6",
        port: 9598,
        timeout: 10000
      });
    
    console.log(userResponse);  
    console.log("Login to VSCP daemon");

    // Log on to server (step 1 user name)
    // The response object is returned and logged
    userResponse = await vscpclient.sendCommand(
      {
        command: "user",
        argument: "admin"
      });
    console.log(userResponse);
  
    // Log on to server (step 2 password)
    userResponse = await vscpclient.sendCommand(
      {
        command: "pass",
        argument: "secret"
      });
    console.log(userResponse);
  
    userResponse = await vscpclient.setFilter({
      filterPriority: 0,
      filterClass: 0,
      filterType: 0,
      filterGuid: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
    });
    console.log(userResponse);

    userResponse = await vscpclient.setMask({
      maskPriority: 0,
      maskClass: 0,
      maskType: 0,
      maskGuid: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
    });
    console.log(userResponse);

    // Enter receive loop
    userResponse = await vscpclient.startRcvLoop();
    console.log(userResponse);        

    while ( brun ) {
        yield();
    }  
    
    // Enter receive loop
    userResponse = await vscpclient.stopRcvLoop();
    console.log(userResponse);

  
    console.log("Disconnect from VSCP daemon");

    // Disconnect from remote VSCP server/device
    await vscpclient.disconnect();
  }
  testAsync().catch(err => {
    console.log("Catching error");
    console.log(err);
  })
