var WireLogParser = (function () {
    'use strict';

    function WireLogParser(doesRemoveNewLine) {
        if (doesRemoveNewLine !== false) {
            doesRemoveNewLine = true;
        }
        this.doesRemoveNewLine = doesRemoveNewLine;
    }

    var WireLogUnit = (function () {
        function WireLogUnit() {
            this.logs = [];
        }

        WireLogUnit.prototype.add = function (arg) {
            var log = {
                'log': arg.log,
                'type': arg.type
            };
            if (arg.headerName) {
                log.headerName = arg.headerName;
            }
            this.logs.push(log);
        };

        WireLogUnit.prototype.toString = function () {
            var str = '';
            var logsLength = this.logs.length;
            var i;

            for (i = 0; i < logsLength; i++) {
                str += this.logs[i].log + '\n';
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
            var requestLog = arg.requestLog;
            var responseLog = arg.responseLog;

            if (
                typeof requestLog === 'undefined' ||
                !(requestLog instanceof WireLogUnit)
            ) {
                requestLog = new WireLogUnit();
            }

            if (
                typeof responseLog === 'undefined' ||
                !(responseLog instanceof WireLogUnit)
            ) {
                responseLog = new WireLogUnit();
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

        var assembleLogObj = function (args) {
            var self = args.self,
                log = args.log,
                group = args.group,
                logContainer = args.logContainer,
                direction = args.direction;

            var type = 'body';

            // init (at the 1st line of request or response)
            if (typeof logContainer[group] === 'undefined') {
                logContainer[group] = new WireLogUnit();
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

                if (this.doesRemoveNewLine === true) {
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
                    'self': this,
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

                if (this.doesRemoveNewLine === true) {
                    entity = removeNewLine(entity);
                }

                // to support to reuse connection
                usedConnections[connection] = true;

                assembleLogObj({
                    'self': this,
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
