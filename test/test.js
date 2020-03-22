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

var sleep = require('sleep');

//const srv = "127.0.0.1";
const srv = "192.168.1.6";
//const srv = "192.168.1.26";   // pi2
//const srv = "192.168.1.44";   // pi11
//const srv = "192.168.1.44";

const testAsync = async () => {

    console.log("List constants from vscp module");
    console.log("===============================");
    console.log(vscp.version.major);
    console.log(vscp_type(65535,12),vscp_type.VSCP_TYPE_MEASUREMENT_PRESSURE);
    console.log(vscp_class(88),vscp_class.VSCP_CLASS2_MEASUREMENT_STR);

    console.log(vscp);

    console.log("List constants from vscp_class module");
    console.log("=====================================");
    console.log(vscp_class);

    console.log("List constants from vscp_type module");
    console.log("====================================");
    console.log(vscp_type);

    console.log("Connect to local VSCP daemon");
    console.log("============================");

    let vscpclient = new vscp_tcp_client(); 

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
  
    // Connect to VSCP server/device
    const value1 = await vscpclient.connect(
      {
        host: srv,
        port: 9598,
        timeout: 10000
      });
  
    console.log("Send NOOP command to VSCP daemon");

    // Send no operation command (does nothing)
    await vscpclient.sendCommand(
      {
        command: "noop"
      });
  
    console.log("Send NOOP command to VSCP daemon");

    // Send no operation command (does nothing)
    await vscpclient.sendCommand(
      {
        command: "noop"
      });
  
    console.log("Send NOOP command to VSCP daemon");

    // Send no operation command (does nothing)
    await vscpclient.sendCommand(
      {
        command: "noop"
      });
  
    console.log("Login to VSCP daemon");

    // Log on to server (step 1 user name)
    // The response object is returned and logged
    const userResponse = await vscpclient.sendCommand(
      {
        command: "user",
        argument: "admin"
      });
    console.log(userResponse);
  
    // Log on to server (step 2 password)
    await vscpclient.sendCommand(
      {
        command: "pass",
        argument: "secret"
      });
  
    console.log("Get active interfaces on VSCP daemon");

    // Get interfaces available on remote VSCP server
    const iff = await vscpclient.getInterfaces();
    console.log(iff);

    console.log("Send NOOP command to VSCP daemon");
  
    // Send no operation command (does nothing)
    var rv = await vscpclient.sendCommand(
      {
        command: "noop"
      }
    );
    console.log(rv);

    console.log("Get version for VSCP daemon");

    // Get VSCP remote server version
    const ver = await vscpclient.getRemoteVersion();
    console.log(ver);

    const cnt2 = await vscpclient.getPendingEventCount();

    var ev = {};
    ev.head = 0;
    ev.vscpObId = 13,
    ev.vscpTimeStamp = 123,
    ev.vscpClass = 10,
    ev.vscpType = 6,
    ev.vscpGuid = "00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF",
    ev.vscpData = [1,2,3,4,5,6,7,8]

    console.log("\n\nSend event to vscp VSCP daemon (obj)");
    const options1 = {};
    options1.event = ev;
    rv = await vscpclient.sendEvent(options1);
    console.log("Response from sendEvent: ", rv);

    console.log("\n\nSend event to vscp VSCP daemon (string)");
    const options2 = {};
    options2.event = "0,10,6,13,2020-03-08T19:15:53.000Z,123,00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF,1,2,3,4,5,6,7,8";
    rv = await vscpclient.sendEvent(options2);
    console.log("Response from sendEvent: ", rv);
      
    console.log("Sleeping for ten seconds to collect some events...");
    sleep.sleep(10);

    console.log("Get number of events waiting to be fetched on VSCP daemon");

    // Get number of VSCP events waiting to be fetched
    const cnt = await vscpclient.getPendingEventCount();
    console.log("Number of events available: "+cnt);    

    if ( cnt > 0 )  {
      console.log("Receive waiting events from the VSCP daemon");
      let events = await vscpclient.getEvents(
        {
          count: cnt
        });
      console.log(events);  
    }

    console.log("Disconnect from VSCP daemon");

    // Disconnect from remote VSCP server/device
    await vscpclient.disconnect();
  }
  
  testAsync().catch(err => {
    console.log("Catching error");
    console.log(err);
  })
