.PHONY: prepare
prepare:
	yarn install
	yarn build

.PHONY: run_hardhat_node
run_hardhat_node:
	npx hardhat node --port 8546 --hostname 127.0.0.1

NETWORK_NAME:=L1
.PHONY: _run_test
_run_test:
	npx hardhat test test/e2e/$(TEST_NAME).js --network $(NETWORK_NAME)

.PHONY: test_RestakeTokens
test_RestakeTokens:
	$(MAKE) _run_test TEST_NAME=RestakeTokens

.PHONY: test_SendTokens
test_SendTokens:
	$(MAKE) _run_test TEST_NAME=SendTokens

.PHONY: test_TokenApprove
test_TokenApprove:
	$(MAKE) _run_test TEST_NAME=TokenApprove
