/** Characters to represent bases */
const baseChars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const numChars = "0123456789";
const symbolChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_";

/** Maximum digits after decimal point */
const MAX_DP = 15;

/** Operator precedence */
const precedence = {
    "^": 1,
    "*": 2, "/": 2, "%": 3,
    "+": 3, "-": 3,
    "(": 4,
    "=": 5, 
};

// Token types
const TYPE_NUMBER = 0; // A plain number { value: number }
const TYPE_LITERAL = 1; // Number literal which hasn't been converted { value: string, isNegative: boolean }
const TYPE_OPERATOR = 2; // An operator { value: string }
const TYPE_SYMBOL = 3; // A symbol to be used in `symbols` map { value: string }
const TYPE_FUNCTION = 4; // A function call { value: string, args: token[][] }

function tokenTypeToString(t) {
    switch (t) {
        case TYPE_LITERAL: return "literal";
        case TYPE_OPERATOR: return "operator";
        case TYPE_SYMBOL: return "symbol";
        case TYPE_FUNCTION: return "function";
    }
}

function literalTokenToNum(t, base) {
    return (t.isNegative ? -1 : 1) * toBase10(t.value, base);
}

function performOperation(op, a, b) {
    switch (op) {
        case "^": return Math.pow(a, b);
        case "*": return a * b;
        case "/": return a / b;
        case "%": return a % b;
        case "+": return a + b;
        case "-": return a - b;
        default: throw new Error(`Unknown operator '${op}'`);
    }
}

/** Convert from the given base to base-10 */
function toBase10(str, base) {
    if (str === "nan") return NaN;
    if (str === "inf") return Infinity;
    if (base < 2 || base >= baseChars.length) throw new Error(`Unsupported base: ${base}. Must be between 2 and ${baseChars.length - 1}`);
    if (base < baseChars.indexOf("z") + 2) str = str.toLowerCase();

    let decimal = str.indexOf(".");
    if (decimal !== str.lastIndexOf(".")) throw new Error(`Number may only contain one decimal point`);
    if (decimal === -1) decimal = str.length;

    let n = 0;
    // Whole part
    for (let i = decimal - 1, k = 1; i >= 0; i--, k *= base) {
        let a = baseChars.indexOf(str.charAt(i));
        if (a >= base) throw new Error(`Invalid character for base ${base}: ${str.charAt(i)}`);
        n += a * k;
    }
    // Decimal part
    for (let i = decimal + 1, k = 1 / base; i < str.length; i++, k /= base) {
        let a = baseChars.indexOf(str.charAt(i));
        if (a >= base) throw new Error(`Invalid character for base ${base}: ${str.charAt(i)}`);
        n += a * k;
    }
    return n;
}

/** convert from base-10 to the given base  */
function fromBase10(n, base) {
    if (isNaN(n)) return "nan";
    if (!isFinite(n)) return "inf";
    if (base < 2 || base >= baseChars.length) throw new Error(`Unsupported base: ${base}. Must be between 2 and ${baseChars.length - 1}`);

    let neg = false;
    if (n < 0) {
        neg = true;
        n = -n;
    }
    let str = "", quot = n, rem;
    while (quot !== 0) {
        let n = quot;
        quot = Math.floor(n / base);
        rem = n % base;
        str = baseChars.charAt(rem) + str;
    }
    
    // Fraction?
    let fstr = "";
    if (n !== parseInt(n)) {
        let frac = n - Math.floor(n), r = 0;
        while (frac !== 0 && (r++) < MAX_DP) {
            let ans = frac * base;
            fstr += Math.floor(ans);
            frac = ans - Math.floor(ans);
        }
    }
    return (neg ? "-" : "") + (str === "" ? "0" : str) + (fstr === "" ? "" : "." + fstr);
}

/** Return index of matching closing bracket, or -1 if none found */
function getMatchingBracket(str, startIndex = 0) {
    let open = 0;
    for (let i = startIndex; i < str.length; i++) {
        if (str[i] === "(") {
            open++;
        } else if (str[i] === ")") {
            open--;
            if (open === 0) return i;
        }
    }

    return -1;
}

/** Given infix string, return postfix stack of tokens */
function tokenize(str) {
    str += " ";
    const stack = [], postfix = [];
    let canBeNegative = true, isNegative = false;

    for (let i = 0; i < str.length; ) {
        const c = str.charAt(i);

        if (c === " " || c === "\t" || c === "\r" || c === "\n") {
            i++;
            continue;
        }

        if (c === "-" && canBeNegative && i + 1 < str.length && numChars.includes(str.charAt(i + 1))) {
            isNegative = true;
            canBeNegative = false;
            i++;
            continue;
        }

        // Digit?
        if (numChars.includes(c)) {
            let j = i, digit = "", c;
            while (j < str.length && (baseChars.includes(c = str.charAt(j++)) || c === ".")) digit += c;
            postfix.push({
                type: TYPE_LITERAL,
                value: digit,
                isNegative,
            });
            isNegative = false;
            canBeNegative = false;
            i = j - 1;
            continue;
        }
        
        // Close bracket group; dump stack
        if (c === ")") {
            canBeNegative = false;
            let t;
            while (stack.length !== 0 && (t = stack.pop()).value !== "(") {
                postfix.push(t);
            }
            i++;
            continue;
        }

        // Symbol?
        if (symbolChars.includes(c)) {
            let j = i, symbol = "", c;
            while (j < str.length && (symbolChars.includes(c = str.charAt(j++)))) symbol += c;
            postfix.push({
                type: TYPE_SYMBOL,
                value: symbol,
            });
            i = j - 1;

            // Is function call?
            if (i < str.length && str.charAt(i) === "(") {
                j = getMatchingBracket(str, i);
                if (j === -1) throw new Error(`Syntax Error: unmatched bracket '${str.charAt(i)}'`);
                const args = str.substring(i + 1, j);
                
                const t = postfix[postfix.length - 1];
                t.type = TYPE_FUNCTION;

                // TODO support multiple arguments
                const tokens = tokenize(args);
                t.args = [];
                if (tokens.length !== 0) t.args.push(tokens);

                i = j + 1;
            }

            continue;
        }

        // Is operator?
        let match = null;
        for (let op of Object.keys(precedence)) {
            if (str.substring(i, i + op.length) === op) {
                match = op;
                break;
            }
        }

        if (match !== null) {
            canBeNegative = true;
            const t = { type: TYPE_OPERATOR, value: match };
            if (stack.length === 0 || match === "(") {
                stack.push(t); // Add directly to the stack
            } else if (precedence[stack[stack.length - 1].value] > precedence[t.value]) {
                stack.push(t); // Add as lower precedence
            } else {
                // Dump stack until we can add the operator
                while (stack.length > 0 && precedence[stack[stack.length - 1].value] <= precedence[t.value]) {
                    postfix.push(stack.pop());
                }
                stack.push(t);
            }
            i += match.length;
            continue;
        }

        throw new Error(`Unknown token '${c}'`);
    }

    // Dump stack
    while (stack.length > 0) postfix.push(stack.pop());

    return postfix;
}

function evaluate(postfix, nBase, symbols, functions) {
    if (isNaN(nBase) || nBase < 2 || nBase >= baseChars.length) throw new Error(`Unsupported base: ${nBase}. Must be between 2 and ${baseChars.length - 1}`);

    const stack = [];
    for (let i = 0; i < postfix.length; i++) {
        const t = postfix[i];

        switch (t.type) {
            case TYPE_NUMBER:
            case TYPE_LITERAL:
            case TYPE_SYMBOL:
                stack.push(t);
                break;
            case TYPE_OPERATOR: {
                if (stack.length < 2) throw new Error(`Operator ${t.value} requires two operands, found ${stack.length} only`);
                if (t.value === '=') {
                    const val = tokenToNumber(stack.pop(), nBase, symbols);
                    const sym = stack.pop();
                    if (sym.type !== TYPE_SYMBOL) throw new Error(`Syntax Error: expected symbol on lhs of '=', got ${tokenTypeToString(sym.type)}`);
                    symbols.set(sym.value, val);
                    stack.push(sym);
                } else {
                    const b = tokenToNumber(stack.pop(), nBase, symbols);
                    const a = tokenToNumber(stack.pop(), nBase, symbols);
                    const x = performOperation(t.value, a, b);
                    stack.push({ type: TYPE_NUMBER, value: x});
                }
                break;
            }
            case TYPE_FUNCTION: {
                if (!functions.has(t.value)) throw new Error(`Name Error: '${t.value}'`);
                const obj = functions.get(t.value);
                if (obj.args !== t.args.length) throw new Error(`Argument Error: ${t.value} expects ${obj.args} argument(s), got ${t.args.length}`);
                if (obj.builtin) {
                    const args = t.args.map(ts => evaluate(ts, nBase, symbols, functions));
                    const value = obj.f.apply(this, args);
                    stack.push({ type: TYPE_NUMBER, value });
                } else {
                    throw new Error(`Unsupported Error: non-builtin functions (namely, '${t.value}') are not supported`);
                }
                break;
            }
            default:
                throw new Error(`Unknown token type '${t.type}'`);
        }
    }

    if (stack.length === 0) return 0;
    if (stack.length === 1) return tokenToNumber(stack.pop(), nBase, symbols);
    throw new Error(`Syntax Error: expected operator`);
}

/** Given a token, return a numerical value */
function tokenToNumber(t, base, symbols) {
    switch (t.type) {
        case TYPE_NUMBER:
            return t.value;
        case TYPE_SYMBOL:
            if (symbols.has(t.value)) return symbols.get(t.value);
            throw new Error(`Name Error: '${t.value}'`);
        case TYPE_LITERAL:
            return literalTokenToNum(t, base);
        default:
            throw new Error(`Value Error: expected literal or token, got ${tokenTypeToString(t.type)}`);
    }
}

function calculate() {
    const raw = eInput.value.trim();
    eInput.value = raw;
    eOutput.classList.remove("error");
    eOutput.innerHTML = "";
    if (raw.length === 0) return;

    if (reTokenize || tokens === undefined) {
        try {
            tokens = tokenize(raw);
        } catch (e) {
            eOutput.classList.add("error");
            eOutput.innerText = e.message;
            return;
        }
        reTokenize = false;
    }
    
    let val;
    try {
        val = evaluate(tokens, baseIn, symbols, functions);
        val = fromBase10(val, baseOut);
    } catch (e) {
        eOutput.classList.add("error");
        eOutput.innerText = e.message;
        return;
    }

    eOutput.insertAdjacentText("beforeend", val);
}

const eBaseIn = document.getElementById("base-in");
const eBaseOut = document.getElementById("base-out");
let baseIn = +eBaseIn.value, baseOut = +eBaseOut.value, reTokenize = false;
let tokens = undefined;
const eInput = document.getElementById("input");
const eButton = document.getElementById("button");
const eOutput = document.getElementById("output");

const symbols = new Map(); // string => number
symbols.set("pi", Math.PI);

const functions = new Map(); // string => function
functions.set("sin", { builtin: true, f: Math.sin, args: 1 });
functions.set("cos", { builtin: true, f: Math.cos, args: 1 });
functions.set("tan", { builtin: true, f: Math.tan, args: 1 });
functions.set("asin", { builtin: true, f: Math.asin, args: 1 });
functions.set("acos", { builtin: true, f: Math.acos, args: 1 });
functions.set("atan", { builtin: true, f: Math.atan, args: 1 });
functions.set("exp", { builtin: true, f: Math.exp, args: 1 });
functions.set("sqrt", { builtin: true, f: Math.sqrt, args: 1 });
functions.set("cbrt", { builtin: true, f: Math.cbrt, args: 1 });
functions.set("fac", { builtin: true, f: n => {
    if (n <= 0) return 1;
    if (n !== Math.floor(n)) throw new Error(`Argument Error: factorial is not defined for fractional values`);
    let k = 1;
    for (; n > 1; n--) k *= n;
    return k;
}, args: 1 });

eBaseIn.addEventListener("change", () => {
    if (+eBaseIn.value !== baseIn) {
        baseIn = +eBaseIn.value;
        calculate();
    }
});

eBaseOut.addEventListener("change", () => {
    if (+eBaseOut.value !== baseOut) {
        baseOut = +eBaseOut.value;
        calculate();
    }
});

eInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
        reTokenize = true;
        calculate();
    }
});

eButton.addEventListener("click", () => {
    reTokenize = true;
    calculate();
});

