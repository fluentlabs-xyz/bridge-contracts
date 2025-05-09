// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

contract Queue {
    mapping(uint256 => bytes32) private data;
    uint256 private front;
    uint256 private back;

    constructor() {
        front = 0;
        back = 0;
    }

    function enqueue(bytes32 value) public {
        data[back] = value;
        back++;
    }

    function dequeue() public returns (bytes32) {
        require(!isEmpty(), "Queue is empty");
        bytes32 value = data[front];
        delete data[front];
        front++;
        return value;
    }

    function peek() public view returns (bytes32) {
        require(!isEmpty(), "Queue is empty");
        return data[front];
    }

    function isEmpty() public view returns (bool) {
        return back == front;
    }

    function size() external view returns (uint256) {
        return back - front;
    }
}
