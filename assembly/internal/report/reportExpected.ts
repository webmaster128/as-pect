import { ValueType } from "./ValueType";
import { Box } from "./Box";

// @ts-ignore: Decorators *are* valid here!
@external("__aspect", "reportExpectedNull")
declare function reportExpectedNull(negated: i32): void;

// @ts-ignore: Decorators *are* valid here!
@external("__aspect", "reportExpectedValue")
declare function reportExpectedFloat(value: f64, signed: bool, negated: i32): void;

// @ts-ignore: Decorators *are* valid here!
@external("__aspect", "reportExpectedValue")
declare function reportExpectedInteger(value: i32, signed: bool, negated: i32): void;

// @ts-ignore: Decorators *are* valid here!
@external("__aspect", "reportExpectedReference")
declare function reportExpectedReferenceExternal(value: usize, offset: i32, negated: i32): void;

// @ts-ignore: Decorators *are* valid here!
@external("__aspect", "reportExpectedString")
declare function reportExpectedString(value: string, negated: i32): void;

// @ts-ignore: Decorators *are* valid here!
@external("__aspect", "reportExpectedArray")
declare function reportExpectedArray(value: usize, negated: i32): void;

// @ts-ignore: Decorators *are* valid here!
@external("__aspect", "reportExpectedFalsy")
declare function reportExpectedFalsy(negated: i32): void;

// @ts-ignore: Decorators *are* valid here!
@external("__aspect", "reportExpectedTruthy")
declare function reportExpectedTruthy(negated: i32): void;

// @ts-ignore: Decorators *are* valid here!
@external("__aspect", "reportExpectedFinite")
declare function reportExpectedFinite(negated: i32): void;

// @ts-ignore: Decorators *are* valid here!
@external("__aspect", "reportInvalidExpectCall")
declare function reportInvalidExpectCall(): void;

// @ts-ignore: Decorators *are* valid here!
@external("__aspect", "reportExpectedLong")
declare function reportExpectedLong(pointer: usize, signed: bool, negated: i32): void;

export class Expected {
  static ready: bool = false;
  static type: ValueType = ValueType.Null;
  static signed: bool = false;
  static float: f64 = 0;
  static integer: i32 = 0;
  static reference: usize;
  static offset: i32 = 0;
  static expectation: usize = 0;
  static negated: i32 = 0;
}

export function __sendExpected(): void {
  switch(Expected.type) {
    case ValueType.Array:
      reportExpectedArray(changetype<usize>(Expected.reference), Expected.negated);
      break;
    case ValueType.Float:
      // Do not convert to unsigned because floats are signed
      reportExpectedFloat(Expected.float, true, Expected.negated);
      break;
    case ValueType.Integer:
      reportExpectedInteger(Expected.integer, Expected.signed, Expected.negated);
      break;
    case ValueType.Null:
      reportExpectedNull(Expected.negated);
      break;
    case ValueType.Reference:
      reportExpectedReferenceExternal(Expected.reference, Expected.offset, Expected.negated);
      break;
    case ValueType.String:
      reportExpectedString(changetype<string>(Expected.reference), Expected.negated);
      break;
    case ValueType.Falsy:
      reportExpectedFalsy(Expected.negated);
      break;
    case ValueType.Finite:
      reportExpectedFinite(Expected.negated);
      break;
    case ValueType.Truthy:
      reportExpectedTruthy(Expected.negated);
      break;
    case ValueType.Long:
      reportExpectedLong(Expected.reference, Expected.signed, Expected.negated);
      break;
  }
}


/**
 * This function performs reporting to javascript what the expected value of this expectation is.
 */
// @ts-ignore: Decorators *are* valid here!
@inline
export function reportExpected<T>(expected: T, negated: i32): void {
  if (!Expected.ready) {
    reportInvalidExpectCall();
    return;
  }

  // set negated first
  Expected.negated = negated;

  // if T is a reference type...
  if (isReference<T>()) {
    // check to see if it's null
    if (expected == null) {
      Expected.type = ValueType.Null;
    } else {
      let ptr = changetype<usize>(expected);
      __retain(ptr);
      __release(Expected.reference);
      Expected.reference = ptr;

      // otherwise it might be an array..
      if (isArray<T>()) {
        Expected.type = ValueType.Array;
        // or a string...
      } else if (expected instanceof String) {
        Expected.type = ValueType.String;
        // it also might be an array buffer
      } else if (expected instanceof ArrayBuffer) {
        //todo: change this to const when AS supports it
        let buff = changetype<ArrayBuffer>(expected);
        Expected.type = ValueType.Reference;
        // reporting the reference is as simple as using the pointer and the byteLength property.
        Expected.offset = buff.byteLength;
      } else {
        // otherwise report the reference in a default way
        Expected.type = ValueType.Reference;
        Expected.offset = offsetof<T>();
      }
    }
  } else {
    if (isFloat<T>()) {
      Expected.type = ValueType.Float;
      // @ts-ignore: this cast is valid because it's already a float and this upcast is not lossy
      Expected.float = <f64>expected;
    } else if (expected instanceof i64 || expected instanceof u64) {
      Expected.type = ValueType.Long;
      Expected.signed = expected instanceof i64;
      let ref = new Box<T>(expected);
      let ptr = changetype<usize>(ref);
      __retain(ptr);
      __release(Expected.reference);
      Expected.reference = ptr;
    } else {
      Expected.type = ValueType.Integer;
      Expected.signed = expected instanceof i32;
      // @ts-ignore: this cast is valid because it's already an integer, but this is a lossy conversion
      Expected.integer = <i32>expected;
    }
  }
}

// @ts-ignore: Decorators *are* valid here
@inline
export function reportExpectedReference(ptr: usize, offset: i32, negated: i32): void {
  Expected.type = ValueType.Reference;
  __retain(ptr);
  __release(Expected.reference);
  Expected.reference = ptr;
  Expected.offset = offset;
  Expected.negated = negated;
}
