// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "../interfaces/IERC20.sol";

library SafeTransferLib {
    error TokenCallFailed(address token);

    function safeTransfer(IERC20 token, address to, uint256 amount) internal {
        _call(token, abi.encodeCall(token.transfer, (to, amount)));
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 amount) internal {
        _call(token, abi.encodeCall(token.transferFrom, (from, to, amount)));
    }

    function forceApprove(IERC20 token, address spender, uint256 amount) internal {
        if (!_callOptional(token, abi.encodeCall(token.approve, (spender, amount)))) {
            _call(token, abi.encodeCall(token.approve, (spender, 0)));
            _call(token, abi.encodeCall(token.approve, (spender, amount)));
        }
    }

    function _call(IERC20 token, bytes memory data) private {
        if (!_callOptional(token, data)) revert TokenCallFailed(address(token));
    }

    function _callOptional(IERC20 token, bytes memory data) private returns (bool) {
        if (address(token).code.length == 0) return false;
        (bool success, bytes memory result) = address(token).call(data);
        return success && (result.length == 0 || (result.length == 32 && abi.decode(result, (bool))));
    }
}
