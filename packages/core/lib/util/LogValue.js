(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    /**
     * A virtual representation of a discrete value logged to from AssemblyScript.
     */
    var LogValue = /** @class */ (function () {
        function LogValue() {
            /**
             * If a pointer is referenced, this is the precise memory location of the referenced block of
             * data.
             */
            this.pointer = 0;
            /**
             * If a pointer is referenced and isn't a string, this is the size of the referenced block of
             * data.
             */
            this.offset = 0;
            /**
             * If a pointer is referenced and ins't a string, this is an array of bytes to be logged byt the
             * logger.
             */
            this.bytes = [];
            /**
             * If an array is referenced, it's values will be here.
             */
            this.values = [];
            /**
             * This is a message generated by the TestSuite to be displayed in the logger.
             */
            this.message = "";
            /**
             * This is the relevant stack trace, filtered with the `/wasm/i` regex.
             */
            this.stack = "";
            /**
             * This is the referenced log target.
             */
            this.target = null;
            /**
             * This is the raw logged value.
             */
            this.value = null;
            /**
             * This is a function pointer is an index.
             */
            this.fnPointer = -1;
        }
        return LogValue;
    }());
    exports.LogValue = LogValue;
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTG9nVmFsdWUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvdXRpbC9Mb2dWYWx1ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7OztJQUVBOztPQUVHO0lBQ0g7UUFBQTtZQUNFOzs7ZUFHRztZQUNJLFlBQU8sR0FBVyxDQUFDLENBQUM7WUFFM0I7OztlQUdHO1lBQ0ksV0FBTSxHQUFXLENBQUMsQ0FBQztZQUUxQjs7O2VBR0c7WUFDSSxVQUFLLEdBQWEsRUFBRSxDQUFDO1lBRTVCOztlQUVHO1lBQ0ksV0FBTSxHQUFhLEVBQUUsQ0FBQztZQUU3Qjs7ZUFFRztZQUNJLFlBQU8sR0FBVyxFQUFFLENBQUM7WUFFNUI7O2VBRUc7WUFDSSxVQUFLLEdBQVcsRUFBRSxDQUFDO1lBRTFCOztlQUVHO1lBQ0ksV0FBTSxHQUFzQixJQUFJLENBQUM7WUFFeEM7O2VBRUc7WUFDSSxVQUFLLEdBQWtCLElBQUksQ0FBQztZQUVuQzs7ZUFFRztZQUNJLGNBQVMsR0FBVyxDQUFDLENBQUMsQ0FBQztRQUNoQyxDQUFDO1FBQUQsZUFBQztJQUFELENBQUMsQUFoREQsSUFnREM7SUFoRFksNEJBQVEifQ==