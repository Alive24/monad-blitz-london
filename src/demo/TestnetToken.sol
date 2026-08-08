// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "../interfaces/IERC20.sol";

/// @notice Mintable testnet token used only by the on-chain Live Lab deployment.
contract TestnetToken is IERC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    address public immutable owner;
    uint256 public totalSupply;

    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;

    error Unauthorized();

    constructor(string memory name_, string memory symbol_, uint8 decimals_, address owner_) {
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
        owner = owner_;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != owner) revert Unauthorized();
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) private {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}
