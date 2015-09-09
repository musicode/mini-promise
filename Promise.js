/**
 * @file 一个非常简单的 Promise
 * @author musicode
 */

'use strict';

/**
 *
 * Promises/A+ 参考：
 *
 * https://promisesaplus.com/
 *
 * API 非常精简，可以生产环境使用，像我这种没追求的用户完全够用
 *
 */

// value 不用数字是因为调试起来方便
var STATUS_PENDING = 'pending';
var STATUS_FULFILLED = 'fulfilled';
var STATUS_REJECTED = 'rejected';


// 当 promise 是 fulfilled 或 rejected 状态时
// then(onFulfilled, onRejected) 需要异步执行
// 这里找一个尽可能快的延时
var nextTick;

// node
if (typeof process !== 'undefined'
    && process
    && isFunction(process.nextTick)
) {
    nextTick = function (fn) {
        process.nextTick(fn);
    };
}
// ie10
else if (isFunction(setImmediate)) {
    nextTick = setImmediate;
}
// 不用搞太复杂，直接 setTimeout
else {
    nextTick = setTimeout;
}


function isFunction(fn) {
    return typeof fn === 'function';
}

function isPromise(p) {
    return p instanceof Promise;
}

function noop() {

}

/**
 *
 *
 * then 返回一个新的 Promise，因此 then 有两种写法：
 *
 * 第一种：
 *
 * ```
 * promise1.then(onFulfilled, onRejected);
 * promise1.then(onFulfilled, onRejected);
 * promise1.then(onFulfilled, onRejected);
 * ```
 *
 * 第二种：
 *
 * ```
 * promise1
 *     .then(onFulfilled, onRejected)
 *     .then(onFulfilled, onRejected)
 *     .then(onFulfilled, onRejected);
 * ```
 *
 * 第二种可以换种写法，看起来更明确：
 *
 * ```
 * var promise2 = promise1.then(onFulfilled, onRejected);
 * var promise3 = promise2.then(onFulfilled, onRejected);
 * var promise4 = promise3.then(onFulfilled, onRejected);
 * ```
 *
 * 对于第一种来说，回调函数都注册到 promise1 对象了，即 promise1 注册了 3 组回调
 * 对于第二种来说，回调函数注册到新返回的 Promise 对象上了，即 promise1 2 3 各注册了 1 组回调
 *
 * es6 的执行顺序是，按 Promise 的创建顺序依次执行各自的回调
 */

/**
 * 执行注册的回调函数
 *
 * @inner
 * @param {Promise} promise
 */
function flush(promise) {

    if (promise.list === 0) {
        return;
    }

    var list;
    var item;

    var itemResolve;
    var itemReject;
    var itemPromise;

    var func;
    var param;

    // 按 Promise 的创建顺序依次执行各自的回调
    var promises = [ promise ];

    while (promise = promises.shift()) {

        if (promise.status === STATUS_PENDING) {
            continue;
        }

        list = promise.list;

        while (item = list.shift()) {

            // resolve 和 reject 都是可选的
            // 1. 只有 function 类型才是有效值
            // 2. 函数只能执行一次
            // 3. 没有 this（严格模式是 undefined，非严格模式是全局对象）

            // 如果 itemResolve 不是一个函数
            // 并且 promise 是 fulfilled 状态
            // itemPromise 要和 promise 保持一致

            // 如果 itemReject 不是一个函数
            // 并且 promise 是 rejected 状态
            // itemPromise 要和 promise 保持一致

            itemResolve = item.resolve;
            itemReject = item.reject;
            itemPromise = item.promise;

            if (promise.status === STATUS_FULFILLED
                && isFunction(itemResolve)
            ) {
                func = itemResolve;
                param = promise.value;
            }
            else if (promise.status === STATUS_REJECTED
                && isFunction(itemReject)
            ) {
                func = itemReject;
                param = promise.reason;
            }

            if (func) {

                // 如果 itemResolve 或 itemReject 返回了一个值 x
                // 需要执行 resolvePromise(itemPromise, x)

                // 如果 itemResolve 或 itemReject 抛出了一个异常 e，
                // 需要执行 rejectPromise(itemPromise, e)

                try {
                    resolvePromise(itemPromise, func(param));
                }
                catch (e) {
                    rejectPromise(itemPromise, e);
                }

                func = null;

            }
            else {
                adoptPromise(itemPromise, promise);
            }

            promises.push(itemPromise);

        }
    }

}

/**
 * 把 source 修改为 target 的状态
 *
 * @inner
 * @param {Promise} source
 * @param {Promise} target
 */
function adoptPromise(source, target) {

    var status = target.status;

    if (status === STATUS_PENDING) {
        target.then(
            function (value) {
                return resolvePromise(source, value);
            },
            function (reason) {
                return rejectPromise(source, reason);
            }
        );
    }
    else if (status === STATUS_FULFILLED) {
        resolvePromise(source, target.value);
    }
    else if (status === STATUS_REJECTED) {
        rejectPromise(source, target.reason);
    }

}


function resolvePromise(promise, value) {

    if (promise.status !== STATUS_PENDING) {
        return;
    }

    if (promise === value) {
        throw new Error('promise and value refer to the same object.');
    }

    var isProcessed = false;

    // promise
    if (isPromise(value)) {

        isProcessed = true;

        adoptPromise(promise, value);

    }
    else if (typeof value === 'object' || isFunction(value)) {

        var isResolved = false;
        var isRejected = false;

        try {

            // thenable

            var then = value.then;

            if (isFunction(then)) {

                isProcessed = true;

                then.call(
                    value,
                    // resolve 和 reject 确保只执行一次
                    function (value) {
                        if (isResolved) {
                            return;
                        }
                        isResolved = true;
                        resolvePromise(promise, value);
                    },
                    function (reason) {
                        if (isRejected) {
                            return;
                        }
                        isRejected = true;
                        rejectPromise(promise, reason);
                    }
                );

            }

        }
        catch (e) {

            // exception

            if (!isResolved && !isRejected) {

                isProcessed = true;

                rejectPromise(promise, e);

            }
        }

    }

    if (!isProcessed) {
        promise.status = STATUS_FULFILLED;
        promise.value = value;
    }

}

function rejectPromise(promise, reason) {

    if (promise.status !== STATUS_PENDING) {
        return;
    }

    promise.status = STATUS_REJECTED;
    promise.reason = reason;

}


/**
 *
 * @constructor
 * @param {Function} executor
 * @example
 *
 * new Promise(function (resolve, reject) {
 *     resolve(value);
 * });
 *
 */
function Promise(executor) {

    var me = this;

    if (!isPromise(me)) {
        return new Promise(executor);
    }

    if (typeof executor !== 'function') {
        throw new Error('Promise resolver executor is not a function.');
    }

    me.status = STATUS_PENDING;

    me.list = [ ];

    executor(
        function (value) {
            resolvePromise(me, value);
            flush(me);
        },
        function (reason) {
            rejectPromise(me, reason);
            flush(me);
        }
    );

}

var proto = Promise.prototype;

/**
 * 注册处理成功和失败的回调函数
 *
 * @param {Function?} onFulfilled
 * @param {Function?} onRejected
 * @return {Promise}
 */
proto.then = function (onFulfilled, onRejected) {

    var result = Promise(noop);

    var me = this;

    me.list.push({
        resolve: onFulfilled,
        reject: onRejected,
        promise: result
    });

    if (me.status !== STATUS_PENDING) {

        nextTick(
            function () {
                flush(me);
            }
        );

    }

    return result;

};

/**
 * 注册处理失败的回调函数
 *
 * @param {Function} onRejected
 * @return {Promise}
 */
proto.catch = function (onRejected) {
    return this.then(null, onRejected);
};

/**
 * 并行 promise
 *
 * @param {Array} promises
 * @return {Promise}
 */
Promise.all = function (promises) {

    var result = Promise(noop);

    var length = promises.length;
    var couter = 0;
    var values = [ ];

    // 全部成功才执行 onFulfilled
    // 只要有一个失败就算整体失败

    var onFulfilled = function (index, value) {

        values[ index ] = value;

        if (++couter === length) {
            resolvePromise(result, values);
            flush(result);
        }

    };

    var onRejected = function (index, reason) {
        rejectPromise(result, reason);
        flush(result);
    };

    for (var i = 0; i < length; i++) {
        (function (index) {
            promises[ index ].then(
                function (value) {
                    onFulfilled(index, value);
                },
                function (value) {
                    onRejected(index, value);
                }
            );
        })(i);
    }

    return result;

};

/**
 * 返回一个 `fulfilled` 状态的 Promise
 *
 * @param {*} value
 * @return {Promise}
 */
Promise.resolve = function (value) {
    return new Promise(function (resolve) {
        resolve(value);
    });
};

/**
 * 返回一个 `rejected` 状态的 Promise
 *
 * @param {*} reason
 * @return {Promise}
 */
Promise.reject = function (reason) {
    return new Promise(function (resolve, reject) {
        reject(reason);
    });
};


module.exports = Promise;

