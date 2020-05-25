// VSCP javascript websocket library
//
// Copyright © 2012-2020 Ake Hedman, Grodans Paradis AB
// <akhe@grodansparadis.com>
// Copyright (c) 2015-2019 Andreas Merkle
// <vscp@blue-andi.de>
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

const util = require('util');
const events = require('events');
const net = require('net');
const vscp = require('node-vscp');

// To display debug messages
// export NODE_DEBUG=node-vscp-tcp node-vscp-tcp-msg
const debuglog = util.debuglog('node-vscp-tcp');
const msg_debuglog = util.debuglog('node-vscp-tcp-msg');

/* ---------------------------------------------------------------------- */



/**
 * Send VSCP tcp/ip server command
 *
 * @private
 * @class
 * @param {string} command      - Server command string
 * @param {string} argument     - Server command string argument
 * @param {function} onSuccess  - Function which is called on successful
 *     operation
 * @param {function} onerror    - Function which is called on failed operation
 * @param {function} resolve    - Promise resolve function
 * @param {function} reject     - Promise reject function
 */
class Command {
  constructor(command, argument, onSuccess, onError, resolve, reject) {
    /**
     * Server command string
     * @member {string}
     */
    this.command = command.toUpperCase();

    /**
     * Server command string arguments
     * @member {string}
     */
    this.argument = argument;

    /**
     * Function which is called on successful operation
     * @member {function}
     */
    this.onSuccess = onSuccess;

    /**
     * Function which is called on failed operation
     * @member {function}
     */
    this.onError = onError;

    /**
     * Function which is called on successful operation
     * @member {function}
     */
    this.resolve = resolve;

    /**
     * Function which is called on failed operation
     * @member {function}
     */
    this.reject = reject;
  }
}

/**
 * VSCP tcp/ip client, used for connection establishment to a VSCP server.
 * @class
 */
class Client {
  constructor () {
  /**
   * States of the VSCP client
   * @enum {number}
   */
  this.states = {
    /** Not connected */
    DISCONNECTED: 0,
    /** Standard tcp/ip connection established */
    CONNECTED: 1,
    /** Client connection in remote loop */
    RCVLOOP: 2
  };

  /**
   * tcp/ip socket
   * @member {object}
   */
  this.socket = null;

  /**
   * host used for connection establishment
   * @member {string}
   */
  this.host = '127.0.0.1';

  /**
   * port used for connection establishment
   * @member {number}
   */
  this.port = 9598;

  /**
   * timeout used for connection establishment
   * @member {number}
   */
  this.timeout = 500;

  /*!
    Connection timer
  */
  this.timer = 0;

  /**
   * Callback called on any connection error
   * @member {function}
   */
  this.onConnError = null;

  /**
   * Callback called on any received VSCP response message
   * @member {function}
   */
  this.onMessage = null;

  /**
   * Callbacks called on any received VSCP event message
   * @member {function[]}
   */
  this.onEvent = [];

  /**
   * VSCP client is not connected right now
   * @member {number}
   */
  this.state = this.states.DISCONNECTED;

  /**
   * VSCP response data is collected here up to
   * until a "+OK" or "-OK" is found in the stream
   */
  this.collectedData = '';

  /**
   * Queue contains all pending VSCP server commands
   *
   */
  this.cmdQueue = [];

  // inherit EventEmitter functions
  events.EventEmitter.call(this);
  if (false === (this instanceof Client)) return new Client();

  util.inherits(Client, events.EventEmitter);


  /**
   * Get next command from queue with pending commands.
   *
   * @private
   *
   * @return {Command} Command object
   */
  this._getPendingCommand = function() {
    var cmd = null;

    if (0 <= this.cmdQueue.length) {
      cmd = this.cmdQueue[0];
      this.cmdQueue.splice(0, 1);

      return cmd;
    }

    return null;
  };


  /**
   * Signal success of the current asynchronous operation.
   *
   * @private
   * @param {object} [obj]    - Options for on success callback
   */
  this._signalSuccess = function(obj) {
    // Mark as success
    obj.result = 'success';

    // Get command
    var cmd = this._getPendingCommand();


    if (null !== cmd) {
      if (('function' === typeof cmd.onSuccess) && (null !== cmd.onSuccess)) {
        if ('undefined' === typeof obj) {
          cmd.onSuccess();
        } else {
          cmd.onSuccess(obj);
        }
      }

      if (('function' === typeof cmd.resolve) && (null !== cmd.resolve)) {
        if ('undefined' === typeof obj) {
          if (null !== cmd.resolve) {
            cmd.resolve();
          }
        } else {
          /* eslint-disable no-lonely-if */
          if (null !== cmd.resolve) {
            cmd.resolve(obj);
          }
          /* eslint-enable no-lonely-if */
        }
      }
    }
  };

  /**
   * Signal failed of the current asynchronous operation.
   *
   * @private
   * @param {object} [obj]    - Options for on error callback
   */
  this._signalError = function(obj) {
    // Mark as error
    obj.result = 'error';

    var cmd = this._getPendingCommand();

    if (null !== cmd) {
      if (('function' === typeof cmd.onError) && (null !== cmd.onError)) {
        if ('undefined' === typeof obj) {
          cmd.onError();
        } else {
          cmd.onError(obj);
        }
      }

      if (('function' === typeof cmd.reject) && (null !== cmd.reject)) {
        if ('undefined' === typeof obj) {
          if (null !== cmd.reject) {
            cmd.reject();
          }
        } else {
          /* eslint-disable no-lonely-if */
          if (null !== cmd.reject) {
            cmd.reject(obj);
          }
          /* eslint-enable no-lonely-if */
        }
      }
    }
  };


  /**
   * Signal a connection error.
   *
   * @private
   */
  this._signalConnError = function() {
    if (('function' === typeof this.onConnError) &&
        (null !== this.onConnError)) {
      this.onConnError(this);
    }
  };

  /**
   * Signal a received VSCP response message.
   * If the message is handled by the application, the application will return
   * true, which means no further actions shall take place in this object.
   * Otherwise the message is handled by the standard onMessage handler here.
   *
   * @private
   * @param {string} msg - VSCP server response message
   *
   * @return {boolean} Message is handled (true) or not (false).
   */
  this._signalMessage = function(chunk) {
    var status = false;

    if (('function' === typeof this.onMessage) && (null !== this.onMessage)) {
      if (true === this.onMessage(this, chunk)) {
        status = true;
      }
    }

    return status;
  };

  /**
   * Signal a received VSCP event.
   *
   * @private
   * @param {vscpEvent} vscpEvent - VSCP event
   */
  this._signalEvent = function(vscpEvent) {
    var index = 0;

    /* Signal event to all event listeners */
    for (index = 0; index < this.onEvent.length; ++index) {
      if (('function' === typeof this.onEvent[index]) &&
          (null !== this.onEvent[index])) {
        this.onEvent[index](vscpEvent);
      }
    }
  };

  /**
   * Send command to remote VSCP server and store the command in the internal
   * queue. In some situation only a virtual command shall be stored, but not
   * sent. In this case use set the 'simulate' parameter to true.
   *
   * @param {object} options                  - Options
   * @param {string} options.command          - Command string
   * @param {string} [options.argument]       - Command argument string
   * @param {boolean} [options.simulate]      - Simulate the command
   *     (true/false)
   *                                            (default: false)
   * @param {function} [options.onSuccess]    - Callback on success (default:
   *     null)
   * @param {function} [options.onError]      - Callback on error (default:
   *     null)
   * @param {function} [options.resolve]      - Promise resolve function
   *     (default: null)
   * @param {function} [options.reject]       - Promise reject function
   *     (default: null)
   */
  this._sendCommand = function(options) {
    var cmdObj = null;
    var cmdStr = '';
    var cmdArg = '';
    var simulate = false;
    var onSuccess = null;
    var onError = null;
    var resolve = null;
    var reject = null;

    if ('undefined' === typeof options) {
      console.error(vscp.getTime() + ' Options are missing.');
      return;
    }

    if ('string' !== typeof options.command) {
      console.error(vscp.getTime() + ' Command is missing.');
      return;
    } else if (0 === options.command) {
      console.error(vscp.getTime() + ' Command is empty.');
      return;
    }

    if ('string' === typeof options.argument) {
      cmdArg = options.argument;
    }

    if ('boolean' === typeof options.simulate) {
      simulate = options.simulate;
    }

    if ('function' === typeof options.onSuccess) {
      onSuccess = options.onSuccess;
    }

    if ('function' === typeof options.onError) {
      onError = options.onError;
    }

    if ('function' === typeof options.resolve) {
      resolve = options.resolve;
    }

    if ('function' === typeof options.reject) {
      reject = options.reject;
    }

    /* Put command to queue with pending commands */
    cmdObj = new Command(
        options.command, options.argument, onSuccess, onError, resolve, reject);
    this.cmdQueue.push(cmdObj);

    if (false === simulate) {
      /* Build command string */
      cmdStr = options.command;

      if (0 < cmdArg.length) {
        cmdStr += ' ' + cmdArg;
      }

      cmdStr += '\r\n'

      /* Send command via tcp/ip to the VSCP server */
      debuglog(vscp.getTime() + ' Cmd: ' + cmdStr.trim());
      this.socket.write(cmdStr);
    }
  };

  // ----------------------------------------------------------------------------
  //                              Response Parsers
  // ----------------------------------------------------------------------------

  /**
   * Parse remote server version
   *
   * @param {string array} result   - Command response from remote server
   * @return {object}               - Server version object
   */
  this.parseRemoteVersion =
      function(result) {
    let version = {};
    let cntElements = result.response.length;
    if ((result.response.length >= 2) && (result.command === 'VERSION') &&
        (result.response[cntElements - 1]).substr(0, 3) === '+OK') {
      let verArray = result.response[cntElements - 2].split(',');
      version.major = verArray[0];
      version.minor = verArray[1];
      version.release = verArray[2];
      version.build = verArray[3];
    }
    return version;
  }

      /**
       * Parse remote server pending event queue
       *
       * @param {string array} result   - Command response from remote server
       * @return {number}               - Number of events in inqueue.
       */
      this.parsePendingEventsCount =
          function(result) {
    let cnt = 0;
    let cntElements = result.response.length;

    if ((result.response.length >= 2) && (result.command === 'CHKDATA') &&
        (result.response[cntElements - 1]).substr(0, 3) === '+OK') {
      cnt = parseInt(result.response[cntElements - 2]);
    }

    return cnt;
  }

          /**
           * Parse response from interface list and return
           * object with structured interface information
           *
           * @param {string array} result   - Command response from remote
           *     server
           * @return {object array}         - Array with interface objects
           */
          this.parseInterface =
              function(result) {
    let interfaces = [];
    let cntElements = result.response.length;
    if (result.response.length && (result.command === 'INTERFACE LIST') &&
        (result.response[cntElements - 1]).substr(0, 3) === '+OK') {
      result.response.pop();  // remove '+OK'
      result.response.forEach((item) => {
        let items = item.split(',');
        let obj = {};
        obj.index = parseInt(items[0]);
        obj.type = parseInt(items[1]);
        obj.guid = items[2];
        obj.name = items[3].split('|')[0];
        let startStr = items[3].split('|')[1].substr()
        obj.started = startStr.substr(startStr.length - 19);
        interfaces.push(obj);
      });
    }

    return interfaces;
  }

              /**
               * Parse response from challenge and return
               * challenge string
               *
               * @param {string array} result   - Command response from remote
               *     server
               * @return {string}               - Challenge key.
               */
              this.parseChallenge =
                  function(result) {
    let challenge = '';
    let cntElements = result.response.length;
    if ((result.response.length >= 2) && (result.command === 'CHALLENGE') &&
        (result.response[cntElements - 1]).substr(0, 3) === '+OK') {
      challenge = result.response[cntElements - 2];
    }

    return challenge;
  }

                  /**
                   * Parse response from 'retr n' and return
                   * retrieved VSCP events in array
                   *
                   * @param {string array} result   - Command response from
                   *     remote server
                   * @return {object array}         - Array with VSCP objectS
                   */
                  this.parseRetrieveEvents =
                      function(result) {
    let events = [];
    let cntElements = result.response.length;

    if ((result.response.length >= 2) && (result.command === 'RETR') &&
        (result.response[cntElements - 1]).substr(0, 3) === '+OK') {
      for (let i = 0; i < (cntElements - 1); i++) {
        var e = new vscp.Event();
        e.setFromString(result.response[i]);
        events.push(e);
      }
    }

    return events;
  }

                      /**
                       * Parse statistics line from remote server
                       *
                       * @param {string array} result   - Command response from
                       *     remote server
                       * @return {object}               - Statistics object
                       */

                      this.parseStatistics =
                          function(result) {
    let statistics = {};
    let cntElements = result.response.length;
    if ((result.response.length >= 2) && (result.command === 'STAT') &&
        (result.response[cntElements - 1]).substr(0, 3) === '+OK') {
      let statsArray = result.response[cntElements - 2].split(',');
      if (statsArray >= 7) {
        statistics.cntReceiveData = parseInt(statsArray[3]);
        statistics.cntReceiveFrames = parseInt(statsArray[4]);
        statistics.cntTransmitData = parseInt(statsArray[5]);
        statistics.cntTransmitFrames = parseInt(statsArray[6]);
      }
    }

    return statistics;
  }

                          /**
                           * Parse info line from remote server
                           *
                           * @param {string array} result   - Command response
                           *     from remote server
                           * @return {object}               - Info. object
                           */
                          this.parseInfo = function(result) {
    let info = {};
    let cntElements = result.response.length;
    if ((result.response.length >= 2) && (result.command === 'INFO') &&
        (result.response[cntElements - 1]).substr(0, 3) === '+OK') {
      let statsArray = result.response[cntElements - 2].split(',');
      if (statsArray >= 4) {
        info.status = parseInt(statsArray[0]);
        info.lastErrorCode = parseInt(statsArray[1]);
        info.lastErrorSubCode = parseInt(statsArray[2]);
        info.lastErrorStr = statsArray[3];
      }
    }

    return info;
  };

  /**
   * Parse remote server channel id
   *
   * @param {string array} result   - Command response from remote server
   * @return {number}               - Server channel id.
   *
   */
  this.parseChid =
      function(result) {
    let chid = -1;
    let cntElements = result.response.length;
    if ((result.response.length >= 2) && (result.command === 'CHID') &&
        (result.response[cntElements - 1]).substr(0, 3) === '+OK') {
      chid = parseInt(result.response[cntElements - 2]);
      result.chid = chid;
    }

    return chid;
  }

      /**
       * Parse remote server GUID
       *
       * @param {string array} result   - Command response from remote server
       * @return {numeric array}        - GUID
       */
      this.parseGUID =
          function(result) {
    let GUID = [];
    let cntElements = result.response.length;
    if ((result.response.length >= 2) && (result.command === 'GETGUID') &&
        (result.response[cntElements - 1]).substr(0, 3) === '+OK') {
      GUID = result.response[cntElements - 2];
      result.guid = GUID;
    }

    return GUID;
  }



          /**
           * Parse remote server WCYD code
           *
           * @param {string array} result   - Command response from remote
           *     server
           * @return {numeric array}        - What can you do array
           */
          this.parseWcyd =
              function(result) {
    let wcyd = [];
    let cntElements = result.response.length;
    if ((result.response.length >= 2) && (result.command === 'WCYD') &&
        (result.response[cntElements - 1]).substr(0, 3) === '+OK') {
      wcyd = result.response[cntElements - 2].split('-');
      result.wcyd = wcyd;
    }

    return wcyd;
  }


              /**
               * Parse remote server OK response
               *
               * @param {string array} result   - Command response
               *                                    from remote server
               * @return {boolean}              - true if "+OK" response
               */

              this.parseOK =
                  function(result) {
    var rv = false;
    let cntElements = result.response.length;
    if ((result.response.length >= 1) &&
        (result.response[cntElements - 1]).substr(0, 3) === '+OK') {
      rv = true;
    }

    return rv;
  }


                  /**
                   * Add an event listener.
                   *
                   * @param {function} eventListener - Event
                   *     listener function
                   */
                  this.addEventListener = function(eventListener) {
    if ('function' === typeof eventListener) {
      this.onEvent.push(eventListener);
    }
  };

  /**
   * Remove an event listener.
   *
   * @param {function} eventListener - Event listener function
   */
  this.removeEventListener = function(eventListener) {
    var index = 0;

    for (index = 0; index < this.onEvent.length; ++index) {
      if (this.onEvent[index] === eventListener) {
        this.onEvent.splice(index, 1);
      }
    }
  };

  /**
   * This function is called for any VSCP server response message
   * and handle and parse response from the server until a line with
   * either +OK or -OK is found. If a receive loop
   * is active events are fired as they come in.
   *
   * @param {string} chunk - VSCP server response chunk
   */
  this.onSrvResponse = function(chunk) {
    var responseList = [];

    this.collectedData += chunk.toString();

    /* Send message to application. If the application handled the message,
     * nothing more to do. Otherwise the message will be handled now.
     */
    if (false === this._signalMessage(chunk)) {
      // Command response?
      // Save lines up to +OK/-OK
      if (this.state === this.states.CONNECTED) {
        let posOk, posEnd;

        // Positive response? ("+OK ......\r\n")
        if (-1 !== (posOk = this.collectedData.search('\\+OK'))) {
          var lastPart = this.collectedData.substring(posOk);
          msg_debuglog('lastPart = [' + lastPart + ']');
          if (-1 !== (posEnd = lastPart.search('\r\n'))) {
            msg_debuglog(posOk, posEnd);
            var response = this.collectedData.substring(0, posOk) +
                lastPart.substring(0, posEnd + 2);
            msg_debuglog('response = [' + response + ']');
            lastPart = this.collectedData.substring(posOk + posEnd + 2);
            msg_debuglog('lastPart = [' + lastPart + ']');

            // save remaining part of server response for further processing
            this.collectedData =
                this.collectedData.substring(posOk + 2 + posEnd + 2);
            responseList = response.split('\r\n');
            responseList.pop();  // Remove last ('\r\n')
            msg_debuglog(responseList);
            this._signalSuccess({
              command: this.cmdQueue[0].command,
              argument: this.cmdQueue[0].argument,
              response: responseList
            });
          }
        } else if (-1 !== (posOk = this.collectedData.search('\\-OK'))) {
          lastPart = this.collectedData.substring(posOk);
          msg_debuglog('lastPart = [' + lastPart + ']');
          if (-1 !== (posEnd = lastPart.search('\r\n'))) {
            msg_debuglog(posOk, posEnd);
            response = this.collectedData.substring(0, posOk) +
                lastPart.substring(0, posEnd + 2);
            msg_debuglog('response = [' + response + ']');
            lastPart = this.collectedData.substring(posOk + posEnd + 2);
            msg_debuglog('lastPart = [' + lastPart + ']');
            // save remaining part of server response for further processing
            this.collectedData =
                this.collectedData.substring(posOk + 2 + posEnd + 2);
            responseList = response.split('\r\n');
            responseList.pop();
            // Negative response
            this._signalError({
              command: this.cmdQueue[0].command,
              argument: this.cmdQueue[0].argument,
              response: responseList
            });
          }
        }

      } else if (this.state === this.states.RCVLOOP) {
        responseList = chunk.toString().split('\r\n');
        responseList.pop();  // Remove last CR LF pair

        for (let idx = 0; idx < responseList.length; idx++) {
          msg_debuglog('[' + responseList[idx] + ']');

          if ('+OK' !== responseList[idx]) {
            try {
              let offset = 0;
              var eventItems = responseList[idx].split(',');
              let evt = {};
              evt.vscpHead = 0;
              evt.vscpHead = parseInt(eventItems[0]);
              evt.vscpClass = parseInt(eventItems[1]);
              evt.vscpType = parseInt(eventItems[2]);
              evt.vscpObId = parseInt(eventItems[3]);

              if (0 < eventItems[4].length) {
                evt.vscpDateTime = new Date(eventItems[4]);
              } else {
                evt.vscpDateTime = new Date();
              }

              evt.vscpTimeStamp = parseInt(eventItems[5]);
              evt.vscpGuid = eventItems[6];
              evt.vscpData = [];

              if ((512 <= evt.vscpClass) && (1024 > evt.vscpClass)) {
                offset = 16;
              }

              for (var index = 0; index < (eventItems.length - 7 - offset);
                   ++index) {
                evt.vscpData[index] = parseInt(eventItems[offset + 7 + index]);
              }

              msg_debuglog(
                  vscp.getTime() + ' Evt: ' +
                  ' CLASS = ' + evt.vscpClass + ' TYPE = ' + evt.vscpType +
                  ' GUID = ' + evt.vscpGuid +
                  ' DATETIME = ' + evt.vscpDateTime.toISOString() +
                  ' PRIORITY =  DATA = ' + evt.vscpData);

              this._signalEvent(evt);
            } catch (err) {
              console.error('Exception in event emitter:', err.message);
            }
          } else if (-1 !== responseList[idx].search('\\-OK -')) {
            let err = new Error('onSrvResponse: rcvloop error');
            this.emit('error', err);
          } else {
            this.emit('alive');
          }
        }
      } else {
        debuglog('onSrvResponse: Invalid state');
        let err = new Error('onSrvResponse: Invalid state');
        this.emit('error', err);
      }
    }
  };



  /**
   * Connect to a VSCP tcp/ip server with the given host:port.
   *
   * @param {object} options                  - Options
   * @param {string} options.host             - VSCP server to connect to
   * @param {string} options.port             - VSCP server port to connect to
   * @param {string} [options.localaddress]   - Local address the socket should
   *     connect from.
   * @param {number} [options.localport]      - Local port the socket should
   *     connect from.
   * @param {number} [options.family]         - Version of IP stack, can be
   *     either 4 or 6. Default: 4.
   * @param {number} [options.timeout]        - timeout to use for connect
   *     operation
   * @param {number} [options.idletimeout]    - idle timeout for connection
   * @param {function} [options.onMessage]    - Function which is called on any
   *     received
   *                                              VSCP response message.
   * @param {function} [options.onSuccess]    - Function which is called on a
   *     successful
   *                                              connection establishment.
   * @param {function} [options.onError]      - Function which is called on a
   *                                              failed connection
   * establishment or in case the connection is lost during the session.
   *
   * @return {object} Promise
   */
  this.connect = function(options) {
    return new Promise(function(resolve, reject) {
      var connobj = {};
      var idleTimeout = 0;
      var onSuccess = null;

      if (this.states.DISCONNECTED !== this.state) {
        console.error(vscp.getTime() + ' A connection already exists.');
        reject(Error('A connection already exists.'));
        return;
      }

      if ('undefined' === typeof options) {
        console.error(vscp.getTime() + ' Options are missing.');
        reject(Error('Options are missing.'));
        return;
      }

      if ('string' === typeof options.host) {
        this.host = options.host;
      }

      if ('number' === typeof options.port) {
        this.port = options.port;
      }

      if ('string' === typeof options.localhost) {
        connobj.localAddress = options.localhost;
      }

      if ('number' === typeof options.localport) {
        connobj.localPort = options.localport;
      }

      if ('number' === typeof options.family) {
        connobj.family = options.family;
      }

      if ('number' === typeof options.timeout) {
        this.timeout = options.timeout;
      }

      if ('number' === typeof options.idletimeout) {
        idleTimeout = options.idletimeout;
      }

      if ('function' === typeof options.onSuccess) {
        onSuccess = options.onSuccess;
      }

      if ('function' !== typeof options.onError) {
        this.onConnError = null;
      } else {
        this.onConnError = options.onError;
      }

      console.info(
          vscp.getTime() + ' Initiating VSCP tcp/ip client connect to ' +
          this.host + ':' + this.port + ')');

      connobj.host = this.host;
      connobj.port = this.port;

      this.socket = net.createConnection(connobj, () => {
        this.socket.on('data', (chunk) => {
          clearTimeout(this.timer);
          this.onSrvResponse(chunk);
        });

        this.socket.once('end', () => {
          if (this.state !== this.states.DISCONNECTED) {
            clearTimeout(this.timer);
            this.emit('disconnect');
            console.info(
                vscp.getTime() + ' tcp/ip connection closed (by remote end).');
            this.state = this.states.DISCONNECTED;
            this._signalConnError();
          }
        });

        console.info(
            vscp.getTime() +
            ' tcp/ip connection to remote VSCP server established.');
        this.state = this.states.CONNECTED;

        this.emit('connect');
        clearTimeout(this.timer);

        this._sendCommand({
          command: '_CONNECT_',
          data: '',
          simulate: true,
          onSuccess: onSuccess,
          onError: null,
          resolve: resolve,
          reject: reject
        })
      });

      this.timer = setTimeout(function() {
        console.error('[ERROR] Attempt at connection exceeded timeout value');
        this.socket.end();
        reject(Error('tcp/ip connection timed out.'));
      }.bind(this), this.timeout);

      // Report timeout condition
      if (idleTimeout > 0) {
        this.socket.setTimeout(idleTimeout);
      }

      this.socket.on('error', function(error) {
        this.emit('error', error);
        clearTimeout(this.timer);

        console.error(vscp.getTime() + ' Could not open a connection.');

        this._signalConnError();

        this.onConnError = null;
        this.onMessage = null;

        reject(Error('Couldn\'t open a tcp/ip connection.'));
      }.bind(this));

      this.socket.on('timeout', function() {
        this.emit('timeout');
        debuglog('connect: timeout');
      }.bind(this));
    }.bind(this));
  };

  /**
   * Disconnect from a VSCP server.
   *
   * @param {object} options                  - Options
   * @param {function} [options.onSuccess]    - Function which is called on a
   *     successful
   *                                              disconnection.
   * @return {object} Promise
   */
  this.disconnect = function(options) {
    /* eslint-disable no-unused-vars */
    return new Promise(function(resolve, reject) {
    /* eslint-enable no-unused-vars */

      var onSuccess = null;

      console.info(
          vscp.getTime() + '[COMMAND] Disconnect VSCP tcp/ip connection.');

      if ('undefined' !== typeof options) {
        debuglog('Disconnect: \'options.onSuccess\'' + options.onSuccess);
        if ('function' === typeof options.onSuccess) {
          onSuccess = options.onSuccess;
        }
      }

      this._sendCommand({
        command: 'quit',
        simulate: false,
        onSuccess: onSuccess,
        onError: null,
        resolve: resolve,
        reject: reject
      });

      // Free resources for gc
      this.socket.once('onclose', () => {
        if (this.states.DISCONNECTED === this.state) return;
        console.info(vscp.getTime() + ' Disconnected from remote VSCP server!');
        this.onConnError = null;
        this.onMessage = null;
        this.onEvent = [];
        this.socket = null;
        this.state = this.states.DISCONNECTED;
        this.cmdQueue = [];
        this.emit('disconnect'); // Tell the world
      });
    }.bind(this));
  };

  /**
   * Send command to remote VSCP server and store the command in the internal
   * queue. In some situation only a virtual command shall be stored, but not
   * sent. In this case use set the 'simulate' parameter to true.
   *
   * @param {object} options                  - Options
   * @param {string} options.command          - Command string
   * @param {string} [options.argument]       - Command argument string
   * @param {boolean} [options.simulate]      - Simulate the command
   *     (true/false)
   *                                              (default: false)
   * @param {function} [options.onSuccess]    - Callback on success (default:
   *     null)
   * @param {function} [options.onError]      - Callback on error (default:
   *     null)
   * @param {function} [options.resolve]      - Promise resolve function
   *     (default: null)
   * @param {function} [options.reject]       - Promise reject function
   *     (default: null)
   */
  this.sendCommand = function(options) {
    /* eslint-disable no-unused-vars */
    return new Promise(function(resolve, reject) {
      /* eslint-enable no-unused-vars */

      var cmdObj = null;
      var cmdStr = '';
      var cmdArg = '';
      var simulate = false;
      var onSuccess = null;
      var onError = null;

      if ('undefined' === typeof options) {
        console.error(vscp.getTime() + ' Options are missing.');
        return;
      }

      if ('string' !== typeof options.command) {
        console.error(vscp.getTime() + ' Command is missing.');
        return;
      } else if (0 === options.command) {
        console.error(vscp.getTime() + ' Command is empty.');
        return;
      }

      if ('string' === typeof options.argument) {
        cmdArg = options.argument;
      }

      if ('boolean' === typeof options.simulate) {
        simulate = options.simulate;
      }

      if ('function' === typeof options.onSuccess) {
        onSuccess = options.onSuccess;
      }

      if ('function' === typeof options.onError) {
        onError = options.onError;
      }

      /* Put command to queue with pending commands */
      cmdObj = new Command(
          options.command, options.argument, onSuccess, onError, resolve,
          reject);
      this.cmdQueue.push(cmdObj);

      if (false === simulate) {
        /* Build command string */
        cmdStr = options.command;

        if (0 < cmdArg.length) {
          cmdStr += ' ' + cmdArg;
        }

        cmdStr += '\r\n'

        /* Send command via tcp/ip to the VSCP server */
        debuglog(vscp.getTime() + ' Cmd: ' + cmdStr.trim());
        this.socket.write(cmdStr);
      }
    }.bind(this));
  };

  // ----------------------------------------------------------------------------
  //                                Commands
  // ----------------------------------------------------------------------------

  /**
   * Send event to VSCP server.
   *
   * @param {object} options              - Options
   * @param {string|object} options.event - VSCP event on string or object form
   *     to send
   * @param {function} options.onSuccess  - Callback on success
   * @param {function} options.onError    - Callback on error
   */
  this.sendEvent = async function(options) {
    // var cmdObj = null;
    // var cmdStr = 'send';
    // var event = '';
    var onSuccess = null;
    var onError = null;

    if ('undefined' === typeof options) {
      console.error(vscp.getTime() + ' Options are missing.');
      return;
    }

    if (('string' !== typeof options.event) &&
        ('object' !== typeof options.event)) {
      console.error(vscp.getTime() + ' Event string is missing.');
      return;
    }

    if ('function' === typeof options.onSuccess) {
      onSuccess = options.onSuccess;
    }

    if ('function' === typeof options.onError) {
      onError = options.onError;
    }

    var result;
    if ('object' === typeof options.event) {
      var ev = new vscp.Event(options.event);
      var cmdArg = ev.getAsString();
      result = await this.sendCommand({
        command: 'send',
        argument: cmdArg,
        onSuccess: onSuccess,
        ObError: onError,
      });

    } else {  // string argument

      result = await this.sendCommand({
        command: 'send',
        argument: options.event,
        onSuccess: onSuccess,
        ObError: onError,
      });
    }

    return this.parseOK(result);
  };

  /**
   * Do 'noop' command.
   *
   * @param {object} options               - Options
   * @param {function} [options.onSuccess] - Function which is called on
   *                                         a successful operation
   * @param {function} [options.onError]   - Function which is called on
   *                                         a failed operation
   * @return {object} Result object
   */

  this.noop = async function(options) {
    var onSuccess = null;
    var onError = null;

    if ('undefined' !== typeof options) {
      if ('function' === typeof options.onSuccess) {
        onSuccess = options.onSuccess;
      }

      if ('function' === typeof options.onError) {
        onError = options.onError;
      }
    }

    const result = await this.sendCommand({
      command: 'noop',
      onSuccess: onSuccess,
      onError: onError,
    });

    return this.parseOK(result);
  };

  /**
   * Send 'user' command.
   *
   * @param {object} options               - Options
   * @param {string} options.username      - Valid username for account
   * @param {function} [options.onSuccess] - Function which is called on
   *                                         a successful operation
   * @param {function} [options.onError]   - Function which is called on
   *                                         a failed operation
   * @return {object} Result object
   */
  this.user = async function(options) {
    var onSuccess = null;
    var onError = null;

    if ('undefined' === typeof options) {
      console.error(vscp.getTime() + ' Options are missing.');
      this.reject(Error('Options are missing.'));
      return;
    }

    if ('string' !== typeof options.username) {
      console.error(vscp.getTime() + ' Username is missing.');
      this.reject(Error('Usernme is missing.'));
      return;
    }
    if ('function' === typeof options.onSuccess) {
      onSuccess = options.onSuccess;
    }

    if ('function' === typeof options.onError) {
      onError = options.onError;
    }

    const result = await this.sendCommand({
      command: 'user',
      argument: options.username,
      onSuccess: onSuccess,
      onError: onError,
    });

    return this.parseOK(result);
  };

  /**
   * Send 'password' command.
   *
   * @param {object} options               - Options
   * @param {string} options.password      - Valid password for account
   * @param {function} [options.onSuccess] - Function which is called on
   *                                         a successful operation
   * @param {function} [options.onError]   - Function which is called on
   *                                         a failed operation
   * @return {object} Result object
   */
  this.password = async function(options) {
    var onSuccess = null;
    var onError = null;

    if ('undefined' === typeof options) {
      console.error(vscp.getTime() + ' Options are missing.');
      this.reject(Error('Options are missing.'));
      return;
    }

    if ('string' !== typeof options.password) {
      console.error(vscp.getTime() + ' Password is missing.');
      this.reject(Error('Password is missing.'));
      return;
    }

    if ('function' === typeof options.onSuccess) {
      onSuccess = options.onSuccess;
    }

    if ('function' === typeof options.onError) {
      onError = options.onError;
    }

    const result = await this.sendCommand({
      command: 'pass',
      argument: options.password,
      onSuccess: onSuccess,
      onError: onError,
    });

    return this.parseOK(result);
  };

  /**
   * Send 'quit' command.
   *
   * @param {object} options               - Options
   * @param {function} [options.onSuccess] - Function which is called on
   *                                         a successful operation
   * @param {function} [options.onError]   - Function which is called on
   *                                         a failed operation
   * @return {boolean} Result object
   */
  this.quit = async function(options) {
    var onSuccess = null;
    var onError = null;

    if ('undefined' !== typeof options) {
      if ('function' === typeof options.onSuccess) {
        onSuccess = options.onSuccess;
      }

      if ('function' === typeof options.onError) {
        onError = options.onError;
      }
    }

    const result = await this.sendCommand({
      command: 'quit',
      onSuccess: onSuccess,
      onError: onError,
    });

    return this.parseOK(result);
  };

  /**
   * Send 'challenge' command.
   *
   * @param {object} options               - Options
   * @param {string} options.password      - Valid password for account
   * @param {function} [options.onSuccess] - Function which is called on
   *                                         a successful operation
   * @param {function} [options.onError]   - Function which is called on
   *                                         a failed operation
   * @return {string} Challenge string
   */
  this.challenge = async function(options) {
    var onSuccess = null;
    var onError = null;

    if ('undefined' === typeof options) {
      console.error(vscp.getTime() + ' Options are missing.');
      this.reject(Error('Options are missing.'));
      return;
    }

    if ('string' !== typeof options.password) {
      console.error(vscp.getTime() + ' Password is missing.');
      this.reject(Error('Password is missing.'));
      return;
    }

    if ('function' === typeof options.onSuccess) {
      onSuccess = options.onSuccess;
    }

    if ('function' === typeof options.onError) {
      onError = options.onError;
    }

    const result = await this.sendCommand({
      command: 'challenge',
      argument: options.password,
      onSuccess: onSuccess,
      onError: onError,
    });

    return this.parseChallenge(result);
  };

  /**
   * Start rcvloop.
   *
   * @param {object} options               - Options
   * @param {function} [options.onSuccess] - Function which is called on
   *                                         a successful operation
   * @param {function} [options.onError]   - Function which is called on
   *                                         a failed operation
   * @return {object} Result object
   */
  this.startRcvLoop = async function(options) {
    var onSuccess = null;
    var onError = null;

    if ('undefined' !== typeof options) {
      if ('function' === typeof options.onSuccess) {
        onSuccess = options.onSuccess;
      }

      if ('function' === typeof options.onError) {
        onError = options.onError;
      }
    }

    const result = await this.sendCommand({
      command: 'rcvloop',
      onSuccess: onSuccess,
      onError: onError,
    });

    this.state = this.states.RCVLOOP;
    return result;
  };

  /**
   * Stop rcvloop.
   *
   * @param {object} options               - Options
   * @param {function} [options.onSuccess] - Function which is called on
   *                                         a successful operation
   * @param {function} [options.onError]   - Function which is called on
   *                                   a failed operation
   * @return {object} Result object
   */

  this.stopRcvLoop = async function(options) {
    var onSuccess = null;
    var onError = null;

    if ('undefined' !== typeof options) {
      if ('function' === typeof options.onSuccess) {
        onSuccess = options.onSuccess;
      }

      if ('function' === typeof options.onError) {
        onError = options.onError;
      }
    }

    this.state = this.states.CONNECTED;

    const result = await this.sendCommand({
      command: 'quitloop',
      onSuccess: onSuccess,
      onError: onError,
    });


    return result;
  };

  /**
   * Clear the VSCP event queue on the server side.
   *
   * @param {object} options               - Options
   * @param {function} [options.onSuccess] - Function which is called on
   *                                         a successful operation
   * @param {function} [options.onError]   - Function which is called on
   *                                         a failed operation
   * @return {object} Result object
   */
  this.clearQueue = async function(options) {
    var onSuccess = null;
    var onError = null;

    if ('undefined' !== typeof options) {
      if ('function' === typeof options.onSuccess) {
        onSuccess = options.onSuccess;
      }

      if ('function' === typeof options.onError) {
        onError = options.onError;
      }
    }

    const result = await this.sendCommand({
      command: 'clrall',
      onSuccess: onSuccess,
      onError: onError,
    });

    return result;
  };

  /**
   * Get pending event count from servers inqueue.
   *
   * @param {object} options               - Options
   * @param {function} [options.onSuccess] - Function which is called on
   *                                         a successful operation
   * @param {function} [options.onError]   - Function which is called on
   *                                         a failed operation
   * @return {object array} Fetched events
   */
  this.getPendingEventCount = async function(options) {
    var onSuccess = null;
    var onError = null;

    if ('undefined' !== typeof options) {
      if ('function' === typeof options.onSuccess) {
        onSuccess = options.onSuccess;
      }

      if ('function' === typeof options.onError) {
        onError = options.onError;
      }
    }

    const result = await this.sendCommand({
      command: 'chkdata',
      onSuccess: onSuccess,
      onError: onError,
    });

    return this.parsePendingEventsCount(result);
  };

  /**
   * Get remote server version.
   *
   * @param {object} options               - Options
   * @param {function} [options.onSuccess] - Function which is called on
   *                                         a successful operation
   * @param {function} [options.onError]   - Function which is called on
   *                                         a failed operation
   * @return {object} Remote VSCP server version
   */
  this.getRemoteVersion = async function(options) {
    var onSuccess = null;
    var onError = null;

    if ('undefined' !== typeof options) {
      if ('function' === typeof options.onSuccess) {
        onSuccess = options.onSuccess;
      }

      if ('function' === typeof options.onError) {
        onError = options.onError;
      }
    }

    const result = await this.sendCommand({
      command: 'version',
      onSuccess: onSuccess,
      onError: onError,
    });

    return this.parseRemoteVersion(result);
  };

  /**
   * Do 'restart' command.
   *
   * @param {object} options               - Options
   * @param {string} options.password      - Valid password for account
   * @param {function} [options.onSuccess] - Function which is called on
   *                                         a successful operation
   * @param {function} [options.onError]   - Function which is called on
   *                                         a failed operation
   * @return {object} Result object
   */

  this.restart = async function(options) {
    var onSuccess = null;
    var onError = null;

    if ('undefined' === typeof options) {
      console.error(vscp.getTime() + ' Options are missing.');
      this.reject(Error('Options are missing.'));
      return;
    }

    if ('string' !== typeof options.password) {
      console.error(vscp.getTime() + ' Password is missing.');
      this.reject(Error('Password is missing.'));
      return;
    }

    if ('function' === typeof options.onSuccess) {
      onSuccess = options.onSuccess;
    }

    if ('function' === typeof options.onError) {
      onError = options.onError;
    }

    const result = await this.sendCommand({
      command: 'restart',
      argument: options.password,
      onSuccess: onSuccess,
      onError: onError,
    });

    return result;
  };

  /**
   * Do 'shutdown' command.
   *
   * @param {object} options               - Options
   * @param {string} options.password      - Valid password for account
   * @param {function} [options.onSuccess] - Function which is called on
   *                                         a successful operation
   * @param {function} [options.onError]   - Function which is called on
   *                                         a failed operation
   * @return {object} Result object
   */
  this.shutdown = async function(options) {
    var onSuccess = null;
    var onError = null;

    if ('undefined' === typeof options) {
      console.error(vscp.getTime() + ' Options are missing.');
      this.reject(Error('Options are missing.'));
      return;
    }

    if ('string' !== typeof options.password) {
      console.error(vscp.getTime() + ' Password is missing.');
      this.reject(Error('Password is missing.'));
      return;
    }

    if ('function' === typeof options.onSuccess) {
      onSuccess = options.onSuccess;
    }

    if ('function' === typeof options.onError) {
      onError = options.onError;
    }

    const result = await this.sendCommand({
      command: 'shutdown',
      argument: options.password,
      onSuccess: onSuccess,
      onError: onError,
    });

    return result;
  };

  /**
   * Set a filter in the VSCP server for VSCP events.
   *
   * @param {object} options                          - Options
   * @param {number} [options.filterPriority]         - Priority filter
   *     (default: 0)
   * @param {number} [options.filterClass]            - Class filter (default:
   *     0)
   * @param {number} [options.filterType]             - Type filter (default: 0)
   * @param {number[]|string} [options.filterGuid]    - GUID filter (default: 0)
   * @param {function} [options.onSuccess]            - Function which is called
   *     on
   *                                                    a successful operation
   * @param {function} [options.onError]              - Function which is called
   *     on
   *                                                    a failed operation
   *
   * @return {object} Promise
   */
  this.setFilter = async function(options) {
    var onSuccess = null;
    var onError = null;
    var cmdData = '';
    var filterPriority = 0;
    var filterClass = 0;
    var filterType = 0;
    var filterGuid = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    debuglog('setFilter');

    if ('undefined' === typeof options) {
      console.error(vscp.getTime() + ' Options are missing.');
      this.reject(Error('Options are missing.'));
      return;
    }

    if ('number' === typeof options.filterPriority) {
      filterPriority = options.filterPriority;
    }

    if ('number' === typeof options.filterClass) {
      filterClass = options.filterClass;
    }

    if ('number' === typeof options.filterType) {
      filterType = options.filterType;
    }

    if (options.filterGuid instanceof Array) {
      if (16 !== options.filterGuid.length) {
        console.error(vscp.getTime() + ' GUID filter length is invalid.');
        this.reject(Error('GUID filter length is invalid.'));
        return;
      }

      filterGuid = options.filterGuid;
    } else if ('string' === typeof options.filterGuid) {
      filterGuid = vscp.strToGuid(options.filterGuid);

      if (16 !== filterGuid.length) {
        console.error(vscp.getTime() + ' GUID filter is invalid.');
        this.reject(Error('GUID filter is invalid.'));
        return;
      }
    }

    if ('function' === typeof options.onSuccess) {
      onSuccess = options.onSuccess;
    }

    if ('function' === typeof options.onError) {
      onError = options.onError;
    }

    cmdData = '0x' + filterPriority.toString(16) + ',';
    cmdData += '0x' + filterClass.toString(16) + ',';
    cmdData += '0x' + filterType.toString(16) + ',';

    cmdData += vscp.guidToStr(filterGuid);

    debuglog('setFilter cmdData: ' + cmdData);

    const result = await this.sendCommand({
      command: 'setfilter',
      argument: cmdData,
      onSuccess: onSuccess,
      onError: onError,
    });

    return result;
  };

  /**
   * Set a mask in the VSCP server for VSCP events.
   *
   * @param {object} options                       - Options
   * @param {number} [options.maskPriority]        - Priority mask (default: 0)
   * @param {number} [options.maskClass]           - Class mask (default:
   *                                                 0xffff)
   * @param {number} [options.maskType]            - Type mask (default:
   *                                                 0xffff)
   * @param {number[]|string} [options.maskGuid]   - GUID mask (default: 0)
   * @param {function} [options.onSuccess]         - Function which is called
   *                                                 on a successful operation
   * @param {function} [options.onError]           - Function which is called
   *                                                 on a failed operation
   * @return {object} Promise
   */
  this.setMask = async function(options) {
    var onSuccess = null;
    var onError = null;
    var cmdData = '';
    var maskPriority = 0;
    var maskClass = 0xffff;
    var maskType = 0xffff;
    var maskGuid = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    if ('undefined' === typeof options) {
      console.error(vscp.getTime() + ' Options are missing.');
      this.reject(Error('Options are missing.'));
      return;
    }

    if ('number' === typeof options.maskPriority) {
      maskPriority = options.maskPriority;
    }

    if ('number' === typeof options.maskClass) {
      maskClass = options.maskClass;
    }

    if ('number' === typeof options.maskType) {
      maskType = options.maskType;
    }

    if (options.maskGuid instanceof Array) {
      if (16 !== options.maskGuid.length) {
        console.error(vscp.getTime() + ' GUID mask length is invalid.');
        this.reject(Error('GUID mask length is invalid.'));
        return;
      }

      maskGuid = options.maskGuid;
    } else if ('string' === typeof options.maskGuid) {
      maskGuid = vscp.strToGuid(options.maskGuid);

      if (16 !== maskGuid.length) {
        console.error(vscp.getTime() + ' GUID mask is invalid.');
        this.reject(Error('GUID mask is invalid.'));
        return;
      }
    }

    if ('function' === typeof options.onSuccess) {
      onSuccess = options.onSuccess;
    }

    if ('function' === typeof options.onError) {
      onError = options.onError;
    }

    cmdData = '0x' + maskPriority.toString(16) + ',';
    cmdData += '0x' + maskClass.toString(16) + ',';
    cmdData += '0x' + maskType.toString(16) + ',';

    cmdData += vscp.guidToStr(maskGuid);

    const result = this.sendCommand({
      command: 'setmask',
      argument: cmdData,
      onSuccess: onSuccess,
      onError: onError,
    });

    return result;
  };

  /**
   * Get interfaces from server.
   *
   * @param {object} options               - Options
   * @param {function} [options.onSuccess] - Function which is called
   *                                         on a successful operation
   * @param {function} [options.onError]   - Function which is called
   *                                         on a failed operation
   * @return {object} interfaces
   */
  this.getInterfaces = async function(options) {
    var onSuccess = null;
    var onError = null;

    if ('undefined' !== typeof options) {
      if ('function' === typeof options.onSuccess) {
        onSuccess = options.onSuccess;
      }

      if ('function' === typeof options.onError) {
        onError = options.onError;
      }
    }

    const result = await this.sendCommand({
      command: 'interface list',
      onSuccess: onSuccess,
      onError: onError,
    });

    return this.parseInterface(result);
  };

  /**
   * Retrieve events from server.
   *
   * @param {object} [options]              - Options
   * @param {number} [options.count]        - number of events to fetch
   *                                          default: 1, -1 for all
   * @param {function} [options.onSuccess]  - Function which is called on
   *                                          a successful operation
   * @param {function} [options.onError]    - Function which is called on
   *                                          a failed operation
   * @return {array} Retrieved VSCP events
   */
  this.getEvents = async function(options) {
    var count = 1;
    var onSuccess = null;
    var onError = null;

    if ('undefined' !== typeof options) {
      if ('number' === typeof options.count) {
        count = options.count;
      } else if ('string' === typeof options.count) {
        count = parseInt(options.count);
      }

      if ('function' === typeof options.onSuccess) {
        onSuccess = options.onSuccess;
      }

      if ('function' === typeof options.onError) {
        onError = options.onError;
      }
    }

    const result = await this.sendCommand({
      command: 'retr',
      argument: count.toString(),
      onSuccess: onSuccess,
      onError: onError,
    });

    return this.parseRetrieveEvents(result);
  };

  /**
   * Retrieve statistics from server.
   *
   * @param {object} [options]              - Options
   * @param {function} [options.onSuccess]  - Function which is called on
   *                                          a successful operation
   * @param {function} [options.onError]    - Function which is called on
   *                                          a failed operation
   * @return {object} Retrieved statistics
   */
  this.getStatistics = async function(options) {
    var onSuccess = null;
    var onError = null;

    if ('undefined' !== typeof options) {
      if ('function' === typeof options.onSuccess) {
        onSuccess = options.onSuccess;
      }

      if ('function' === typeof options.onError) {
        onError = options.onError;
      }
    }

    const result = await this.sendCommand({
      command: 'stat',
      onSuccess: onSuccess,
      onError: onError,
    });

    return this.parseStatistics(result);
  };

  /**
   * Retrieve info from server.
   *
   * @param {object} [options]              - Options
   * @param {function} [options.onSuccess]  - Function which is called on
   *                                          a successful operation
   * @param {function} [options.onError]    - Function which is called on
   *                                          a failed operation
   * @return {object} Retrieved info
   */
  this.getInfo = async function(options) {
    var onSuccess = null;
    var onError = null;

    if ('undefined' !== typeof options) {
      if ('function' === typeof options.onSuccess) {
        onSuccess = options.onSuccess;
      }

      if ('function' === typeof options.onError) {
        onError = options.onError;
      }
    }

    const result = await this.sendCommand({
      command: 'info',
      onSuccess: onSuccess,
      onError: onError,
    });
    return this.parseInfo(result);
  };

  /**
   * Retrieve channel id from server.
   *
   * @param {object} [options]              - Options
   * @param {function} [options.onSuccess]  - Function which is called on
   *                                          a successful operation
   * @param {function} [options.onError]    - Function which is called on
   *                                          a failed operation
   * @return {object} Retrieved channel id
   */
  this.getChannelID = async function(options) {
    var onSuccess = null;
    var onError = null;

    if ('undefined' !== typeof options) {
      if ('function' === typeof options.onSuccess) {
        onSuccess = options.onSuccess;
      }

      if ('function' === typeof options.onError) {
        onError = options.onError;
      }
    }

    const result = await this.sendCommand({
      command: 'chid',
      onSuccess: onSuccess,
      onError: onError,
    });

    return this.parseChid(result);
  };

  /**
   * Set GUID for channel.
   *
   * @param {object} [options]              - Options
   * @param {function} [options.onSuccess]  - Function which is called on
   *                                          a successful operation
   * @param {function} [options.onError]    - Function which is called on
   *                                          a failed operation
   * @param {number[]|string} [options.guid]    - GUID (default: 0)
   *
   * @return {object} Result object
   */
  this.setGUID = async function(options) {
    let guid = '-';
    var onSuccess = null;
    var onError = null;

    if ('undefined' === typeof options) {
      console.error(vscp.getTime() + ' Options is missing.');
      this.reject(Error('Options is missing.'));
      return;
    }

    if (('string' !== typeof options.guid) &&
        !(options.guid instanceof Array)) {
      console.error(vscp.getTime() + ' Option \'guid\' is missing.');
      this.reject(Error('Option \'guid\' is missing.'));
      return;
    }

    if (options.guid instanceof Array) {
      if (16 !== options.filterGuid.length) {
        console.error(vscp.getTime() + ' GUID length is invalid.');
        this.reject(Error('GUID length is invalid.'));
        return;
      }

      guid = options.guid;

    } else if ('string' === typeof options.guid) {
      var guidArray = vscp.strToGuid(options.guid);
      if (16 !== guidArray.length) {
        console.error(vscp.getTime() + ' GUID is invalid.');
        this.reject(Error('GUID is invalid.'));
        return;
      }
    }

    if ('function' === typeof options.onSuccess) {
      onSuccess = options.onSuccess;
    }

    if ('function' === typeof options.onError) {
      onError = options.onError;
    }

    const result = await this.sendCommand({
      command: 'setguid',
      argument: guid,
      onSuccess: onSuccess,
      onError: onError,
    });
    return result;
  };

  /**
   * Get GUID for interface.
   *
   * @param {object} [options]              - Options
   * @param {function} [options.onSuccess]  - Function which is called on
   *                                          a successful operation
   * @param {function} [options.onError]    - Function which is called on
   *                                          a failed operation
   * @return {object} Result object
   */
  this.getGUID = async function(options) {
    var onSuccess = null;
    var onError = null;

    if ('undefined' !== typeof options) {
      if ('function' === typeof options.onSuccess) {
        onSuccess = options.onSuccess;
      }

      if ('function' === typeof options.onError) {
        onError = options.onError;
      }
    }

    const result = await this.sendCommand({
      command: 'getguid',
      onSuccess: onSuccess,
      onError: onError,
    });
    return this.parseGUID(result);
  };

  /**
   * Send measurement to server.
   *
   * @param {object} options              - Options
   * @param {number} options.type         - VSCP type value specifying which
   *                                        type of measurement this is.
   * @param {number} options.unit         - The measurement unit for this type
   *                                        of measurement. An be in the
   *                                        range 0-3 for a Level I event and
   * 0-255 for a Level II event.
   * @param {number} options.sensorindex  - The index for the sensor for the
   *                                        unit. Can be in the range 0-7 for a
   *                                        Level I event and 0-255 for a Level
   * II event.
   * @param {number} options.value            - The measurement value.
   * @param {number[]|string} [options.guid]  - GUID (default: 0)
   * @param {number} [options.level]          - Set to 1 or 2 for Level I or
   *     Level
   *                                            II. Default: 2
   * @param {string} [options.eventformat]    - Set to "string" or "float" to
   *                                            generate a
   *                                            string based or a float based
   *                                            event. Default: 'float'
   * @param {number} [options.zone]           - Zone value for Level II events.
   *                                            Defaults to zero.
   * @param {number} [options.subzone]        - Subzone value for Level II
   *     events.
   *                                            Defaults to zero.
   *
   * @return {object} Result object
   * 
   * measurement type,unit,sensorindex,value,[guid],[level],[eventformat],[zone],[subzone]
   */
  this.sendMeasurement = async function(options) {
    var cmdArg = '';
    var level = 2;
    var eventformat = 'float';
    var zone = 0;
    var subzone = 0;
    var onSuccess = null;
    var onError = null;

    if ('undefined' === typeof options) {
      console.error(vscp.getTime() + ' Options is missing.');
      this.reject(Error('Options is missing.'));
      return;
    }

    if ('number' !== typeof options.type) {
      console.error(vscp.getTime() + ' Option \'type\' is missing.');
      this.reject(Error('Option \'type\' is missing.'));
      return;
    }

    cmdArg = options.type.toString() + ',';

    if ('number' !== typeof options.unit) {
      console.error(vscp.getTime() + ' Option \'unit\' is missing.');
      this.reject(Error('Option \'unit\' is missing.'));
      return;
    }

    cmdArg = options.unit.toString() + ',';

    if ('number' !== typeof options.sensorindex) {
      console.error(vscp.getTime() + ' Option \'sensorindex\' is missing.');
      this.reject(Error('Option \'sensorindex\' is missing.'));
      return;
    }

    cmdArg = options.sensorindex.toString() + ',';

    if ('number' !== typeof options.value) {
      console.error(vscp.getTime() + ' Option \'value\' is missing.');
      this.reject(Error('Option \'value\' is missing.'));
      return;
    }

    cmdArg = options.value.toString() + ',';

    if (options.guid instanceof Array) {
      if (16 !== options.filterGuid.length) {
        console.error(vscp.getTime() + ' GUID length is invalid.');
        this.reject(Error('GUID length is invalid.'));
        return;
      }

      cmdArg += vscp.guidToStr(options.guid) + ',';

    } else if ('string' === typeof options.guid) {
      cmdArg += options.guid + ',';
    }

    if ('number' === typeof options.level) {
      if (1 === options.level) {
        level = options.level;
      } else if (2 === options.level) {
        level = options.level;
      } else {
        console.error(
            vscp.getTime() + ' Option \'level\' can only be set to 1 or 2.');
        this.reject(Error('Option \'level\' can only be set to 1 or 2.'));
      }
    }

    cmdArg = level.toString() + ',';

    if ('string' === typeof options.eventformat) {
      if ('float' === options.level) {
        eventformat = options.eventformat;
      } else if ('string' === options.eventformat) {
        eventformat = options.eventformat;
      } else {
        console.error(
            vscp.getTime() +
            ' Option \'eventformat\' can only be set to \'float\' or \'string\'.');
        this.reject(Error(
            'Option \'eventformat\' can only be set to \'float\' or \'string\'.'));
      }
    }

    cmdArg = eventformat + ',';


    if ('number' === typeof options.zone) {
      zone = options.zone;
    }

    cmdArg = zone.toString() + ',';


    if ('number' === typeof options.subzone) {
      subzone = options.subzone;
    }

    cmdArg = subzone.toString();

    if ('function' === typeof options.onSuccess) {
      onSuccess = options.onSuccess;
    }

    if ('function' === typeof options.onError) {
      onError = options.onError;
    }

    const result = await this.sendCommand({
      command: 'measurement',
      argument: cmdArg,
      onSuccess: onSuccess,
      onError: onError,
    });

    return result;
  };


  /**
   * Ask remote server for wcyd code
   *
   * @param {object} [options]              - Options
   * @param {function} [options.onSuccess]  - Function which is called on
   *                                          a successful operation
   * @param {function} [options.onError]    - Function which is called on
   *                                          a failed operation
   * @return {object} Result object
   */
  this.getWhatCanYouDo = async function(options) {
    var onSuccess = null;
    var onError = null;

    if ('undefined' !== typeof options) {
      if ('function' === typeof options.onSuccess) {
        onSuccess = options.onSuccess;
      }

      if ('function' === typeof options.onError) {
        onError = options.onError;
      }
    }

    const result = await this.sendCommand({
      command: 'wcyd',
      onSuccess: onSuccess,
      onError: onError,
    });

    return this.parseWcyd(result);
  };

  return this;
  } // constructor

} // Client class 


module.exports = Client;