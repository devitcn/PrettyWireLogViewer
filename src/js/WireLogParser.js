var WireLogParser = (function () {
    'use strict';

    function WireLogParser(arg) {
        var removeNewLine = arg.removeNewLine,
            bePrettyJSON = arg.bePrettyJSON,
            decodeBytes = arg.decodeBytes;

        if (removeNewLine !== true) {
            removeNewLine = false;
        }

        if (bePrettyJSON !== true) {
            bePrettyJSON = false;
        }

        if (decodeBytes !== true) {
            decodeBytes = false;
        }

        this.removeNewLine = removeNewLine;
        this.bePrettyJSON = bePrettyJSON;
        this.decodeBytes = decodeBytes;
    }

    var WireLogUnit = (function () {
        function WireLogUnit(arg) {
            this.logs = [];

            this.bePrettyJSON = true;
            if (arg.bePrettyJSON !== true) {
                this.bePrettyJSON = false;
            }

            this.decodeBytes = true;
            if (arg.decodeBytes !== true) {
                this.decodeBytes = false;
            }

            this.isContentTypeJSON = false;
        }

        WireLogUnit.prototype.add = function (arg) {
            var log = {
                'log': arg.log,
                'type': arg.type
            };

            var reContentTypeHeader = /^content-type$/i;
            var reContentTypeJSON = /application\/json/i;

            if (arg.headerName) {
                log.headerName = arg.headerName;

                if (
                    log.headerName.match(reContentTypeHeader) &&
                    arg.log.match(reContentTypeJSON)
                ) {
                    this.isContentTypeJSON = true;
                }
            }
            this.logs.push(log);
        };

        WireLogUnit.prototype.toString = function () {
            var str = '';
            var logsLength = this.logs.length;
            var i, line;

            var reEncodedBytes = /(?:\[0x[0-9a-f]{2}\])+/g;
            var reBytes = /0x[0-9a-f]{2}/g;

            for (i = 0; i < logsLength; i++) {
                line = this.logs[i].log;
                if (this.bePrettyJSON && this.isContentTypeJSON && this.logs[i].type === 'body') {
                    try {
                        line = JSON.stringify(JSON.parse(line), null, '    '); // 4 spaces indentation
                    } catch (e) {
                        // NOP
                    }
                }

                if (this.decodeBytes) {
                    // decode byte string to utf-8
                    line = line.replace(reEncodedBytes, function (str) {
                        try {
                            var matches = str.match(reBytes),
                                matchesLen = matches.length,
                                byteString = '';

                            var i;
                            for (i = 0; i < matchesLen; i++) {
                                byteString += String.fromCharCode(parseInt(matches[i], 16));
                            }

                            return utf8.decode(byteString);
                        } catch (e) {
                            return str;
                        }
                    });
                }

                str += line + '\n';
            }

            return str;
        };

        WireLogUnit.prototype.isEmpty = function () {
            return this.logs.length === 0;
        };

        return WireLogUnit;
    }());

    var WireLog = (function () {
        function WireLog(arg) {
            var requestLog = arg.requestLog,
                responseLog = arg.responseLog;

            if (
                typeof requestLog === 'undefined' ||
                !(requestLog instanceof WireLogUnit)
            ) {
                requestLog = new WireLogUnit({});
            }

            if (
                typeof responseLog === 'undefined' ||
                !(responseLog instanceof WireLogUnit)
            ) {
                responseLog = new WireLogUnit({});
            }

            this.requestLog = requestLog;
            this.responseLog = responseLog;
        }

        WireLog.prototype.isEmpty = function () {
            return this.requestLog.isEmpty() && this.responseLog.isEmpty();
        };

        return WireLog;
    }());

    WireLogParser.prototype.parse = function (logText) {
        var extractHeaderName = function (log) {
            var found = log.match(/^([^:]+?):/);
            if (found) {
                return found[1];
            }

            return undefined;
        };

        var removeNewLine = function (log) {
            return log.replace(/(\[\\r\])?\[\\n\]/, ''); // remove string like so "[\r][\n]"
        };

        var self = this;

        var assembleLogObj = function (args) {
            var log = args.log,
                group = args.group,
                logContainer = args.logContainer,
                direction = args.direction;

            var type = 'body';

            // init (at the 1st line of request or response)
            if (typeof logContainer[group] === 'undefined') {
                logContainer[group] = new WireLogUnit({
                    'bePrettyJSON': self.bePrettyJSON,
                    'decodeBytes': self.decodeBytes
                });
                type = 'http-' + direction;
            }

            var headerName = extractHeaderName(log);
            if (typeof headerName !== 'undefined') {
                type = 'header';
            }

            // To set 'body' into `type` when log is beyond the blank line
            var logBlock = logContainer[group].logs;
            var lastLogItem = logBlock[logBlock.length - 1];
            if (typeof lastLogItem !== 'undefined' && lastLogItem.type === 'body') {
                type = 'body';
                headerName = undefined;
            }

            logContainer[group].add({
                'log': log,
                'type': type,
                'headerName': headerName
            });
        };

        var requestLogByGroup = {};
        var responseLogByGroup = {};

        var line, lineNum, found;
        var lines = logText.split(/\r?\n/);

        var numOfLines = lines.length;

        var group, connection, entity;

        var usedConnections = {};
        var connection2group = {};

        for (lineNum = 0; lineNum < numOfLines; lineNum++) {
            line = lines[lineNum];

            // ignore not wire log
            if (!line.match(/org\.apache\.http\.wire/)) {
                continue;
            }

            // for request
            found = line.match(/.*http-outgoing-([0-9]+) >> ("?)(.*)\2/);
            if (found) {
                connection = found[1];
                entity = found[3];

                if (this.removeNewLine === true) {
                    entity = removeNewLine(entity);
                }

                if (
                    typeof usedConnections[connection] === 'undefined' || // when using connection for first time
                    usedConnections[connection] === true                  // when reusing connection
                ) {
                    group = entity;
                    usedConnections[connection] = false;
                    connection2group[connection] = group;

                    // initialize
                    requestLogByGroup[group] = undefined;
                    responseLogByGroup[group] = undefined;
                }

                assembleLogObj({
                    'log': entity,
                    'group': connection2group[connection],
                    'logContainer': requestLogByGroup,
                    'direction': 'request'
                });
                continue;
            }

            // for response
            found = line.match(/.*http-outgoing-([0-9]+) << ("?)(.*)\2/);
            if (found) {
                connection = found[1];
                entity = found[3];

                if (this.removeNewLine === true) {
                    entity = removeNewLine(entity);
                }

                // to support to reuse connection
                usedConnections[connection] = true;

                assembleLogObj({
                    'log': entity,
                    'group': connection2group[connection],
                    'logContainer': responseLogByGroup,
                    'direction': 'response'
                });
                continue;
            }
        }

        var keysOfLog = Object.keys(requestLogByGroup);
        var numOfKeys = keysOfLog.length;

        var i, key;
        var logs = {};
        for (i = 0; i < numOfKeys; i++) {
            key = keysOfLog[i];
            logs[key] = new WireLog({
                'requestLog': requestLogByGroup[key],
                'responseLog': responseLogByGroup[key]
            });
        }

        return logs;
    };

    return WireLogParser;
}());

// for testing
if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') {
   exports.WireLogParser = WireLogParser;
}
