'use strict';

/**
 * DimoScript Interpreter
 * Custom DSL for automated trading in the Dimo bot.
 *
 * Grammar (simplified):
 *   program     → statement*
 *   statement   → assignment | if_stmt | expr_stmt
 *   assignment  → ID '=' expr
 *   if_stmt     → IF expr THEN statement*
 *                 (ELSE IF expr THEN statement*)*
 *                 (ELSE statement*)?
 *                 END
 *   expr_stmt   → func_call
 *   expr        → or_expr
 *   or_expr     → and_expr (OR and_expr)*
 *   and_expr    → not_expr (AND not_expr)*
 *   not_expr    → NOT not_expr | comparison
 *   comparison  → additive (('<'|'>'|'<='|'>='|'=='|'!=') additive)?
 *   additive    → multiplicative (('+' | '-') multiplicative)*
 *   multiplicative → unary (('*' | '/') unary)*
 *   unary       → '-' unary | primary
 *   primary     → NUMBER | STRING | ID | func_call | '(' expr ')'
 *   func_call   → ID '(' (expr (',' expr)*)? ')'
 */

// ── Tokenizer ─────────────────────────────────────────────────────────────────

const TT = {
    NUMBER: 'NUMBER',
    STRING: 'STRING',
    ID: 'ID',
    PLUS: 'PLUS',
    MINUS: 'MINUS',
    STAR: 'STAR',
    SLASH: 'SLASH',
    LPAREN: 'LPAREN',
    RPAREN: 'RPAREN',
    COMMA: 'COMMA',
    EQ: 'EQ',
    NEQ: 'NEQ',
    LT: 'LT',
    GT: 'GT',
    LTE: 'LTE',
    GTE: 'GTE',
    ASSIGN: 'ASSIGN',
    EOF: 'EOF',
    // Keywords
    IF: 'IF',
    THEN: 'THEN',
    ELSE: 'ELSE',
    END: 'END',
    AND: 'AND',
    OR: 'OR',
    NOT: 'NOT',
};

const KEYWORDS = new Set(['IF', 'THEN', 'ELSE', 'END', 'AND', 'OR', 'NOT']);

function tokenize(source) {
    const tokens = [];
    let i = 0;
    const len = source.length;

    while (i < len) {
        // Skip whitespace
        if (/\s/.test(source[i])) { i++; continue; }

        // Comments
        if (source[i] === '#') {
            while (i < len && source[i] !== '\n') i++;
            continue;
        }

        // Numbers
        if (/[0-9]/.test(source[i])) {
            let num = '';
            while (i < len && /[0-9.]/.test(source[i])) num += source[i++];
            tokens.push({ type: TT.NUMBER, value: parseFloat(num) });
            continue;
        }

        // Strings (double-quoted)
        if (source[i] === '"') {
            i++;
            let str = '';
            while (i < len && source[i] !== '"') {
                if (source[i] === '\\' && i + 1 < len) {
                    i++;
                    const esc = source[i];
                    if (esc === 'n') str += '\n';
                    else if (esc === 't') str += '\t';
                    else str += esc;
                    i++;
                } else {
                    str += source[i++];
                }
            }
            if (i < len) i++; // consume closing "
            tokens.push({ type: TT.STRING, value: str });
            continue;
        }

        // Identifiers & keywords
        if (/[A-Z_a-z]/.test(source[i])) {
            let id = '';
            while (i < len && /[A-Z_a-z0-9]/.test(source[i])) id += source[i++];
            const upper = id.toUpperCase();
            if (KEYWORDS.has(upper)) {
                tokens.push({ type: upper, value: upper });
            } else {
                tokens.push({ type: TT.ID, value: id });
            }
            continue;
        }

        // Two-char operators
        if (source[i] === '<' && source[i + 1] === '=') { tokens.push({ type: TT.LTE, value: '<=' }); i += 2; continue; }
        if (source[i] === '>' && source[i + 1] === '=') { tokens.push({ type: TT.GTE, value: '>=' }); i += 2; continue; }
        if (source[i] === '=' && source[i + 1] === '=') { tokens.push({ type: TT.EQ, value: '==' }); i += 2; continue; }
        if (source[i] === '!' && source[i + 1] === '=') { tokens.push({ type: TT.NEQ, value: '!=' }); i += 2; continue; }

        // Single-char operators
        switch (source[i]) {
            case '<': tokens.push({ type: TT.LT, value: '<' }); i++; continue;
            case '>': tokens.push({ type: TT.GT, value: '>' }); i++; continue;
            case '=': tokens.push({ type: TT.ASSIGN, value: '=' }); i++; continue;
            case '+': tokens.push({ type: TT.PLUS, value: '+' }); i++; continue;
            case '-': tokens.push({ type: TT.MINUS, value: '-' }); i++; continue;
            case '*': tokens.push({ type: TT.STAR, value: '*' }); i++; continue;
            case '/': tokens.push({ type: TT.SLASH, value: '/' }); i++; continue;
            case '(': tokens.push({ type: TT.LPAREN, value: '(' }); i++; continue;
            case ')': tokens.push({ type: TT.RPAREN, value: ')' }); i++; continue;
            case ',': tokens.push({ type: TT.COMMA, value: ',' }); i++; continue;
        }

        throw new Error(`알 수 없는 문자: '${source[i]}'`);
    }

    tokens.push({ type: TT.EOF, value: null });
    return tokens;
}

// ── Parser ────────────────────────────────────────────────────────────────────

class Parser {
    constructor(tokens) {
        this.tokens = tokens;
        this.pos = 0;
    }

    peek() { return this.tokens[this.pos]; }
    advance() { return this.tokens[this.pos++]; }

    expect(type) {
        const tok = this.advance();
        if (tok.type !== type) throw new Error(`'${type}' 토큰을 기대했으나 '${tok.type}' 토큰이 왔습니다.`);
        return tok;
    }

    parseProgram() {
        const stmts = [];
        while (this.peek().type !== TT.EOF) {
            stmts.push(this.parseStatement());
        }
        return { type: 'Program', body: stmts };
    }

    parseStatement() {
        const tok = this.peek();

        if (tok.type === TT.IF) {
            return this.parseIf();
        }

        // Assignment: ID = expr  (lookahead: ID followed by ASSIGN)
        if (tok.type === TT.ID && this.tokens[this.pos + 1]?.type === TT.ASSIGN) {
            const name = this.advance().value;
            this.advance(); // consume '='
            const value = this.parseExpr();
            return { type: 'Assignment', name, value };
        }

        // Expression statement (function call)
        const expr = this.parseExpr();
        if (expr.type !== 'FuncCall') {
            throw new Error(`단독으로 사용할 수 없는 표현식입니다.`);
        }
        return { type: 'ExprStmt', expr };
    }

    parseIf() {
        this.expect(TT.IF);
        const condition = this.parseExpr();
        this.expect(TT.THEN);

        const consequent = [];
        while (!this._atBranch() && this.peek().type !== TT.EOF) {
            consequent.push(this.parseStatement());
        }

        const elseifs = [];
        let alternate = null;

        while (this.peek().type === TT.ELSE && this.tokens[this.pos + 1]?.type === TT.IF) {
            this.advance(); // ELSE
            this.advance(); // IF
            const eic = this.parseExpr();
            this.expect(TT.THEN);
            const eib = [];
            while (!this._atBranch() && this.peek().type !== TT.EOF) {
                eib.push(this.parseStatement());
            }
            elseifs.push({ condition: eic, body: eib });
        }

        if (this.peek().type === TT.ELSE) {
            this.advance(); // ELSE
            alternate = [];
            while (this.peek().type !== TT.END && this.peek().type !== TT.EOF) {
                alternate.push(this.parseStatement());
            }
        }

        this.expect(TT.END);
        return { type: 'IfStmt', condition, consequent, elseifs, alternate };
    }

    _atBranch() {
        const t = this.peek().type;
        if (t === TT.END) return true;
        if (t === TT.ELSE) return true;
        return false;
    }

    parseExpr() { return this.parseOr(); }

    parseOr() {
        let left = this.parseAnd();
        while (this.peek().type === TT.OR) {
            this.advance();
            const right = this.parseAnd();
            left = { type: 'BinOp', op: 'OR', left, right };
        }
        return left;
    }

    parseAnd() {
        let left = this.parseNot();
        while (this.peek().type === TT.AND) {
            this.advance();
            const right = this.parseNot();
            left = { type: 'BinOp', op: 'AND', left, right };
        }
        return left;
    }

    parseNot() {
        if (this.peek().type === TT.NOT) {
            this.advance();
            const operand = this.parseNot();
            return { type: 'UnaryOp', op: 'NOT', operand };
        }
        return this.parseComparison();
    }

    parseComparison() {
        let left = this.parseAdditive();
        const cmpOps = new Set([TT.LT, TT.GT, TT.LTE, TT.GTE, TT.EQ, TT.NEQ]);
        if (cmpOps.has(this.peek().type)) {
            const op = this.advance().value;
            const right = this.parseAdditive();
            return { type: 'BinOp', op, left, right };
        }
        return left;
    }

    parseAdditive() {
        let left = this.parseMultiplicative();
        while (this.peek().type === TT.PLUS || this.peek().type === TT.MINUS) {
            const op = this.advance().value;
            const right = this.parseMultiplicative();
            left = { type: 'BinOp', op, left, right };
        }
        return left;
    }

    parseMultiplicative() {
        let left = this.parseUnary();
        while (this.peek().type === TT.STAR || this.peek().type === TT.SLASH) {
            const op = this.advance().value;
            const right = this.parseUnary();
            left = { type: 'BinOp', op, left, right };
        }
        return left;
    }

    parseUnary() {
        if (this.peek().type === TT.MINUS) {
            this.advance();
            const operand = this.parseUnary();
            return { type: 'UnaryOp', op: '-', operand };
        }
        return this.parsePrimary();
    }

    parsePrimary() {
        const tok = this.peek();

        if (tok.type === TT.NUMBER) { this.advance(); return { type: 'Literal', value: tok.value }; }
        if (tok.type === TT.STRING) { this.advance(); return { type: 'Literal', value: tok.value }; }

        if (tok.type === TT.LPAREN) {
            this.advance();
            const expr = this.parseExpr();
            this.expect(TT.RPAREN);
            return expr;
        }

        if (tok.type === TT.ID) {
            const name = this.advance().value;
            // Function call?
            if (this.peek().type === TT.LPAREN) {
                this.advance(); // (
                const args = [];
                if (this.peek().type !== TT.RPAREN) {
                    args.push(this.parseExpr());
                    while (this.peek().type === TT.COMMA) {
                        this.advance();
                        args.push(this.parseExpr());
                    }
                }
                this.expect(TT.RPAREN);
                return { type: 'FuncCall', name, args };
            }
            return { type: 'Var', name };
        }

        throw new Error(`예상치 못한 토큰: '${tok.type}' (값: ${tok.value})`);
    }
}

// ── Evaluator ─────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 10000;

class Evaluator {
    constructor(userId, accountKey, dbFuncs, priceFuncs, discordClient = null) {
        this.userId = userId;
        this.accountKey = accountKey;
        this.vars = {};
        this.logs = [];
        this.dbFuncs = dbFuncs;
        this.priceFuncs = priceFuncs;
        this.discordClient = discordClient;
        this.trades = [];
        this.startTime = Date.now();
    }

    _pushTrade(summary, success) {
        this.trades.push({ summary, success });
    }

    _checkTimeout() {
        if (Date.now() - this.startTime > TIMEOUT_MS) {
            throw new Error('스크립트 실행 시간 초과 (10초)');
        }
    }

    async evalProgram(node) {
        for (const stmt of node.body) {
            this._checkTimeout();
            await this.evalStatement(stmt);
        }
    }

    async evalStatement(node) {
        this._checkTimeout();
        if (node.type === 'Assignment') {
            this.vars[node.name] = await this.evalExpr(node.value);
        } else if (node.type === 'ExprStmt') {
            await this.evalExpr(node.expr);
        } else if (node.type === 'IfStmt') {
            await this.evalIf(node);
        } else {
            throw new Error(`알 수 없는 문장 타입: ${node.type}`);
        }
    }

    async evalIf(node) {
        const cond = await this.evalExpr(node.condition);
        if (this._truthy(cond)) {
            for (const s of node.consequent) await this.evalStatement(s);
            return;
        }
        for (const ei of node.elseifs) {
            const ec = await this.evalExpr(ei.condition);
            if (this._truthy(ec)) {
                for (const s of ei.body) await this.evalStatement(s);
                return;
            }
        }
        if (node.alternate) {
            for (const s of node.alternate) await this.evalStatement(s);
        }
    }

    async evalExpr(node) {
        this._checkTimeout();
        if (node.type === 'Literal') return node.value;
        if (node.type === 'Var') {
            if (!(node.name in this.vars)) throw new Error(`정의되지 않은 변수: ${node.name}`);
            return this.vars[node.name];
        }
        if (node.type === 'BinOp') return await this.evalBinOp(node);
        if (node.type === 'UnaryOp') return await this.evalUnaryOp(node);
        if (node.type === 'FuncCall') return await this.evalFuncCall(node);
        throw new Error(`알 수 없는 표현식 타입: ${node.type}`);
    }

    async evalBinOp(node) {
        const { op } = node;

        if (op === 'AND') {
            const l = await this.evalExpr(node.left);
            if (!this._truthy(l)) return false;
            return this._truthy(await this.evalExpr(node.right));
        }
        if (op === 'OR') {
            const l = await this.evalExpr(node.left);
            if (this._truthy(l)) return true;
            return this._truthy(await this.evalExpr(node.right));
        }

        const left = await this.evalExpr(node.left);
        const right = await this.evalExpr(node.right);

        switch (op) {
            case '+':
                if (typeof left === 'string' || typeof right === 'string')
                    return String(left) + String(right);
                return left + right;
            case '-': return left - right;
            case '*': return left * right;
            case '/':
                if (right === 0) throw new Error('0으로 나눌 수 없습니다.');
                return left / right;
            case '<':  return left < right;
            case '>':  return left > right;
            case '<=': return left <= right;
            case '>=': return left >= right;
            case '==': return left == right;  // eslint-disable-line eqeqeq
            case '!=': return left != right;  // eslint-disable-line eqeqeq
            default: throw new Error(`알 수 없는 연산자: ${op}`);
        }
    }

    async evalUnaryOp(node) {
        const val = await this.evalExpr(node.operand);
        if (node.op === '-') return -val;
        if (node.op === 'NOT') return !this._truthy(val);
        throw new Error(`알 수 없는 단항 연산자: ${node.op}`);
    }

    _truthy(v) {
        return !!v;
    }

    async evalFuncCall(node) {
        const name = node.name.toUpperCase();
        const rawArgs = node.args;

        // Helper: evaluate all args
        const args = async () => {
            const result = [];
            for (const a of rawArgs) result.push(await this.evalExpr(a));
            return result;
        };

        // ── Query functions ────────────────────────────────────────────────────

        if (name === 'PRICE') {
            const [ticker] = await args();
            const price = this.priceFuncs.getStockPrice(String(ticker));
            if (price === null || price === undefined) throw new Error(`존재하지 않는 종목: ${ticker}`);
            return price;
        }

        if (name === 'FUTURE_PRICE') {
            const [ticker] = await args();
            const price = this.priceFuncs.getFuturePrice(String(ticker));
            if (price === null || price === undefined) throw new Error(`존재하지 않는 선물 종목: ${ticker}`);
            return price;
        }

        if (name === 'ETF_PRICE') {
            const [etfId] = await args();
            const price = this.priceFuncs.getEtfPrice(String(etfId));
            if (price === null || price === undefined) throw new Error(`존재하지 않는 ETF: ${etfId}`);
            return price;
        }

        if (name === 'INDEX') {
            const VALID_INDICES = ['DISDAQ'];
            const indexName = rawArgs.length > 0
                ? String(await this.evalExpr(rawArgs[0])).toUpperCase()
                : 'DISDAQ';
            if (!VALID_INDICES.includes(indexName)) {
                throw new Error(`존재하지 않는 주가지수: ${indexName} (사용 가능: ${VALID_INDICES.join(', ')})`);
            }
            const price = this.priceFuncs.getIndexPrice();
            if (price === null || price === undefined) throw new Error('주가 지수를 불러올 수 없습니다.');
            return price;
        }

        if (name === 'BALANCE') {
            const asset = await this.dbFuncs.getActiveAsset(this.userId);
            if (asset.state === 'error') throw new Error('잔액을 불러오는 중 오류가 발생했습니다.');
            return asset.data.balance;
        }

        if (name === 'HOLDINGS') {
            const [ticker] = await args();
            const asset = await this.dbFuncs.getActiveAsset(this.userId);
            if (asset.state === 'error') throw new Error('보유량을 불러오는 중 오류가 발생했습니다.');
            let total = 0;
            for (const s of asset.data.stocks) {
                if (s.ticker === String(ticker)) total += s.quantity;
            }
            return total;
        }

        if (name === 'SHORT_HOLDINGS') {
            const [ticker] = await args();
            const asset = await this.dbFuncs.getActiveAsset(this.userId);
            if (asset.state === 'error') throw new Error('공매도 보유량을 불러오는 중 오류가 발생했습니다.');
            let total = 0;
            for (const s of asset.data.stockShortSales) {
                if (s.ticker === String(ticker)) total += s.quantity;
            }
            return total;
        }

        if (name === 'FUTURES_COUNT') {
            const [ticker] = await args();
            const asset = await this.dbFuncs.getActiveAsset(this.userId);
            if (asset.state === 'error') throw new Error('선물 포지션 수를 불러오는 중 오류가 발생했습니다.');
            let count = 0;
            for (const f of asset.data.futures) {
                if (f.ticker === String(ticker)) count++;
            }
            return count;
        }

        if (name === 'OPTIONS_COUNT') {
            const [ticker, optType] = await args();
            const asset = await this.dbFuncs.getActiveAsset(this.userId);
            if (asset.state === 'error') throw new Error('옵션 포지션 수를 불러오는 중 오류가 발생했습니다.');
            let count = 0;
            for (const o of asset.data.options) {
                if (o.ticker === String(ticker) && o.optionType === String(optType)) count++;
            }
            return count;
        }

        if (name === 'ETF_HOLDINGS') {
            const [etfId] = await args();
            const asset = await this.dbFuncs.getActiveAsset(this.userId);
            if (asset.state === 'error') throw new Error('ETF 보유량을 불러오는 중 오류가 발생했습니다.');
            let total = 0;
            for (const e of asset.data.etfs) {
                if (e.etfId === String(etfId)) total += e.quantity;
            }
            return total;
        }

        if (name === 'FUND_UNITS') {
            const [fundName] = await args();
            const asset = await this.dbFuncs.getActiveAsset(this.userId);
            if (asset.state === 'error') throw new Error('펀드 보유 좌수를 불러오는 중 오류가 발생했습니다.');
            let total = 0;
            for (const f of asset.data.funds) {
                if (f.name === String(fundName)) total += f.unit;
            }
            return total;
        }

        if (name === 'LOANS_COUNT') {
            const asset = await this.dbFuncs.getActiveAsset(this.userId);
            if (asset.state === 'error') throw new Error('대출 수를 불러오는 중 오류가 발생했습니다.');
            return asset.data.loans.length;
        }

        // ── Trading functions ──────────────────────────────────────────────────

        if (name === 'BUY') {
            const [ticker, qty] = await args();
            const result = await this.dbFuncs.stockBuy(this.userId, String(ticker), Number(qty));
            const msg = result.state === 'success'
                ? `[매수] ${ticker} ${result.data}주 완료`
                : `[매수 실패] ${ticker} - ${result.state}`;
            this.logs.push(msg);
            this._pushTrade(msg, result.state === 'success');
            return null;
        }

        if (name === 'SELL') {
            const [ticker, qty] = await args();
            const result = await this.dbFuncs.stockSell(this.userId, String(ticker), Number(qty));
            const msg = result.state === 'success'
                ? `[매도] ${ticker} ${result.data}주 완료`
                : `[매도 실패] ${ticker} - ${result.state}`;
            this.logs.push(msg);
            this._pushTrade(msg, result.state === 'success');
            return null;
        }

        if (name === 'SHORT') {
            const [ticker, qty] = await args();
            const result = await this.dbFuncs.stockShortSell(this.userId, String(ticker), Number(qty));
            const msg = result.state === 'success'
                ? `[공매도] ${ticker} ${qty}주 완료`
                : `[공매도 실패] ${ticker} - ${result.state}`;
            this.logs.push(msg);
            this._pushTrade(msg, result.state === 'success');
            return null;
        }

        if (name === 'FUTURE_LONG') {
            const [ticker, qty, lev] = await args();
            const result = await this.dbFuncs.futureLong(this.userId, String(ticker), Number(qty), Number(lev));
            const msg = result.state === 'success'
                ? `[선물 롱] ${ticker} ${qty}계약 x${lev}배 완료`
                : `[선물 롱 실패] ${ticker} - ${result.state}`;
            this.logs.push(msg);
            this._pushTrade(msg, result.state === 'success');
            return null;
        }

        if (name === 'FUTURE_SHORT') {
            const [ticker, qty, lev] = await args();
            const result = await this.dbFuncs.futureShort(this.userId, String(ticker), Number(qty), Number(lev));
            const msg = result.state === 'success'
                ? `[선물 숏] ${ticker} ${qty}계약 x${lev}배 완료`
                : `[선물 숏 실패] ${ticker} - ${result.state}`;
            this.logs.push(msg);
            this._pushTrade(msg, result.state === 'success');
            return null;
        }

        if (name === 'FUTURE_CLOSE') {
            const [idx] = await args();
            const result = await this.dbFuncs.futureLiquidate(this.userId, Number(idx));
            const msg = result.state === 'success'
                ? `[선물 청산] 포지션 ${idx}번 완료`
                : `[선물 청산 실패] ${idx}번 - ${result.state}`;
            this.logs.push(msg);
            this._pushTrade(msg, result.state === 'success');
            return null;
        }

        if (name === 'OPTION_BUY_CALL') {
            const [ticker, qty, strike] = await args();
            const result = await this.dbFuncs.callOptionBuy(this.userId, String(ticker), Number(qty), Number(strike));
            const msg = result.state === 'success'
                ? `[콜옵션 매수] ${ticker} ${qty}계약 행사가 ${strike} 완료`
                : `[콜옵션 매수 실패] ${ticker} - ${result.state}`;
            this.logs.push(msg);
            this._pushTrade(msg, result.state === 'success');
            return null;
        }

        if (name === 'OPTION_BUY_PUT') {
            const [ticker, qty, strike] = await args();
            const result = await this.dbFuncs.putOptionBuy(this.userId, String(ticker), Number(qty), Number(strike));
            const msg = result.state === 'success'
                ? `[풋옵션 매수] ${ticker} ${qty}계약 행사가 ${strike} 완료`
                : `[풋옵션 매수 실패] ${ticker} - ${result.state}`;
            this.logs.push(msg);
            this._pushTrade(msg, result.state === 'success');
            return null;
        }

        if (name === 'OPTION_SELL_CALL') {
            const [ticker, qty, strike] = await args();
            const result = await this.dbFuncs.callOptionSell(this.userId, String(ticker), Number(qty), Number(strike));
            const msg = result.state === 'success'
                ? `[콜옵션 매도] ${ticker} ${qty}계약 행사가 ${strike} 완료`
                : `[콜옵션 매도 실패] ${ticker} - ${result.state}`;
            this.logs.push(msg);
            this._pushTrade(msg, result.state === 'success');
            return null;
        }

        if (name === 'OPTION_SELL_PUT') {
            const [ticker, qty, strike] = await args();
            const result = await this.dbFuncs.putOptionSell(this.userId, String(ticker), Number(qty), Number(strike));
            const msg = result.state === 'success'
                ? `[풋옵션 매도] ${ticker} ${qty}계약 행사가 ${strike} 완료`
                : `[풋옵션 매도 실패] ${ticker} - ${result.state}`;
            this.logs.push(msg);
            this._pushTrade(msg, result.state === 'success');
            return null;
        }

        if (name === 'OPTION_CLOSE') {
            const [idx] = await args();
            const result = await this.dbFuncs.optionLiquidate(this.userId, Number(idx));
            const msg = result.state === 'success'
                ? `[옵션 청산] 포지션 ${idx}번 완료`
                : `[옵션 청산 실패] ${idx}번 - ${result.state}`;
            this.logs.push(msg);
            this._pushTrade(msg, result.state === 'success');
            return null;
        }

        if (name === 'ETF_BUY') {
            const [etfId, qty] = await args();
            const result = await this.dbFuncs.etfBuy(this.userId, String(etfId), Number(qty));
            const msg = result.state === 'success'
                ? `[ETF 매수] ${etfId} ${qty}좌 완료`
                : `[ETF 매수 실패] ${etfId} - ${result.state}`;
            this.logs.push(msg);
            this._pushTrade(msg, result.state === 'success');
            return null;
        }

        if (name === 'ETF_SELL') {
            const [etfId, qty] = await args();
            const result = await this.dbFuncs.etfSell(this.userId, String(etfId), Number(qty));
            const msg = result.state === 'success'
                ? `[ETF 매도] ${etfId} ${qty}좌 완료`
                : `[ETF 매도 실패] ${etfId} - ${result.state}`;
            this.logs.push(msg);
            this._pushTrade(msg, result.state === 'success');
            return null;
        }

        if (name === 'LOAN') {
            const [amount, days, type] = await args();
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + Number(days));
            const result = await this.dbFuncs.loan(this.userId, Number(amount), dueDate, String(type), Number(days));
            const msg = result.state === 'success'
                ? `[대출] ${Number(amount).toLocaleString()}원 ${days}일 완료`
                : `[대출 실패] ${result.state}`;
            this.logs.push(msg);
            this._pushTrade(msg, result.state === 'success');
            return null;
        }

        if (name === 'LOAN_REPAY') {
            const [num] = await args();
            const result = await this.dbFuncs.loanRepay(this.userId, Number(num));
            const msg = result.state === 'success'
                ? `[대출 상환] ${num}번 완료`
                : `[대출 상환 실패] ${num}번 - ${result.state}`;
            this.logs.push(msg);
            this._pushTrade(msg, result.state === 'success');
            return null;
        }

        if (name === 'DEPOSIT') {
            const [amount, days] = await args();
            const result = await this.dbFuncs.openFixedDeposit(this.userId, Number(amount), Number(days));
            const msg = result.state === 'success'
                ? `[정기예금] ${Number(amount).toLocaleString()}원 ${days}일 완료`
                : `[정기예금 실패] ${result.state}`;
            this.logs.push(msg);
            this._pushTrade(msg, result.state === 'success');
            return null;
        }

        if (name === 'SAVINGS') {
            const [amount, days] = await args();
            const result = await this.dbFuncs.openSavingsAccount(this.userId, Number(amount), Number(days));
            const msg = result.state === 'success'
                ? `[자유적금] ${Number(amount).toLocaleString()}원 ${days}일 완료`
                : `[자유적금 실패] ${result.state}`;
            this.logs.push(msg);
            this._pushTrade(msg, result.state === 'success');
            return null;
        }

        if (name === 'FUND_BUY') {
            const [fundName, amount] = await args();
            const result = await this.dbFuncs.investFund(this.userId, String(fundName), Number(amount));
            const msg = result.state === 'success'
                ? `[펀드 매수] ${fundName} ${Number(amount).toLocaleString()}원 완료`
                : `[펀드 매수 실패] ${fundName} - ${result.state}`;
            this.logs.push(msg);
            this._pushTrade(msg, result.state === 'success');
            return null;
        }

        if (name === 'FUND_SELL') {
            const [fundName, units] = await args();
            const result = await this.dbFuncs.sellFundInvestment(this.userId, String(fundName), Number(units));
            const msg = result.state === 'success'
                ? `[펀드 매도] ${fundName} ${units}좌 완료`
                : `[펀드 매도 실패] ${fundName} - ${result.state}`;
            this.logs.push(msg);
            this._pushTrade(msg, result.state === 'success');
            return null;
        }

        if (name === 'PRINT') {
            const [msg] = await args();
            this.logs.push(String(msg ?? ''));
            return null;
        }

        if (name === 'NOTIFY_POSITION') {
            const [type, positionNum, targetPnL, direction] = await args();
            const result = await this.dbFuncs.addNotification(
                this.userId, 'position', Number(targetPnL), String(direction),
                { type: String(type), positionNum: Number(positionNum) }
            );
            const dirLabel = String(direction) === 'above' ? '이상' : '이하';
            const msg = result.state === 'success'
                ? `[알림 등록] 포지션 ${positionNum}번 PnL ${dirLabel} ${targetPnL} 완료`
                : `[알림 등록 실패] ${result.state}`;
            this.logs.push(msg);
            return null;
        }

        if (name === 'NOTIFY_ACCOUNT') {
            const [targetPnL, direction] = await args();
            const result = await this.dbFuncs.addNotification(
                this.userId, 'account', Number(targetPnL), String(direction), {}
            );
            const dirLabel = String(direction) === 'above' ? '이상' : '이하';
            const msg = result.state === 'success'
                ? `[알림 등록] 계좌 PnL ${dirLabel} ${targetPnL} 완료`
                : `[알림 등록 실패] ${result.state}`;
            this.logs.push(msg);
            return null;
        }

        if (name === 'DM') {
            const [msg] = await args();
            if (!this.discordClient) {
                this.logs.push('[DM 전송 실패] 클라이언트 없음');
                return null;
            }
            try {
                const user = await this.discordClient.users.fetch(this.userId);
                await user.send(String(msg ?? ''));
                this.logs.push(`[DM 전송] ${String(msg ?? '').slice(0, 50)}`);
            } catch (err) {
                this.logs.push(`[DM 전송 실패] ${err.message}`);
            }
            return null;
        }

        throw new Error(`알 수 없는 함수: ${node.name}`);
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

const User = require('../schemas/user');
const State = require('../schemas/state');
const { getStockPrice, getFuturePrice, getIndexPrice } = require('./stock_sim');
const { getEtfPrice } = require('./etf_system');
const db = require('../database');

/**
 * Temporarily sets the user's State.currentAccount to accountKey,
 * runs fn(), then restores the original value.
 */
async function withAccount(userId, accountKey, fn) {
    const user = await User.findOne({ userID: userId });
    if (!user) throw new Error(`사용자를 찾을 수 없습니다: ${userId}`);

    const stateDoc = await State.findById(user.state);
    if (!stateDoc) throw new Error(`상태 문서를 찾을 수 없습니다.`);

    const original = stateDoc.currentAccount;
    let result;
    try {
        stateDoc.currentAccount = accountKey;
        await stateDoc.save();
        result = await fn();
    } finally {
        stateDoc.currentAccount = original;
        await stateDoc.save();
    }
    return result;
}

/**
 * Parses and validates a DimoScript source string.
 * Returns { ok: true } on success, or { ok: false, error: String }.
 */
function validateScript(source) {
    try {
        if (source.length > 4000) return { ok: false, error: '스크립트가 4000자를 초과합니다.' };
        const tokens = tokenize(source);
        const parser = new Parser(tokens);
        parser.parseProgram();
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

/**
 * Executes a DimoScript for the given userId and accountKey.
 * Temporarily switches State.currentAccount so all DB operations use the correct account.
 *
 * @returns {{ logs: string[], error: string|null }}
 */
async function executeScript(userId, accountKey, source, discordClient = null) {
    let parseError = null;
    let ast;
    try {
        const tokens = tokenize(source);
        const parser = new Parser(tokens);
        ast = parser.parseProgram();
    } catch (err) {
        return { logs: [], error: `파싱 오류: ${err.message}` };
    }

    const priceFuncs = { getStockPrice, getFuturePrice, getIndexPrice, getEtfPrice };
    const dbFuncs = {
        getActiveAsset: db.getActiveAsset.bind(db),
        stockBuy: db.stockBuy.bind(db),
        stockSell: db.stockSell.bind(db),
        stockShortSell: db.stockShortSell.bind(db),
        futureLong: db.futureLong.bind(db),
        futureShort: db.futureShort.bind(db),
        futureLiquidate: db.futureLiquidate.bind(db),
        callOptionBuy: db.callOptionBuy.bind(db),
        putOptionBuy: db.putOptionBuy.bind(db),
        callOptionSell: db.callOptionSell.bind(db),
        putOptionSell: db.putOptionSell.bind(db),
        optionLiquidate: db.optionLiquidate.bind(db),
        etfBuy: db.etfBuy.bind(db),
        etfSell: db.etfSell.bind(db),
        loan: db.loan.bind(db),
        loanRepay: db.loanRepay.bind(db),
        openFixedDeposit: db.openFixedDeposit.bind(db),
        openSavingsAccount: db.openSavingsAccount.bind(db),
        investFund: db.investFund.bind(db),
        sellFundInvestment: db.sellFundInvestment.bind(db),
        addNotification: db.addNotification.bind(db),
    };

    const evaluator = new Evaluator(userId, accountKey, dbFuncs, priceFuncs, discordClient);

    try {
        await withAccount(userId, accountKey, async () => {
            await evaluator.evalProgram(ast);
        });
        return { logs: evaluator.logs, trades: evaluator.trades, error: null };
    } catch (err) {
        return { logs: evaluator.logs, trades: evaluator.trades, error: err.message };
    }
}

module.exports = { executeScript, validateScript };
