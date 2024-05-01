.PHONY: prepare
prepare:
	yarn install
	yarn build

.PHONY: run_hardhat_node
run_hardhat_node:
	npx hardhat node --port 8546 --hostname 127.0.0.1

.PHONY: _run_test
_run_test:
	npx hardhat test test/e2e/$(TEST_NAME).js

.PHONY: run_test_RestakeTokens
run_test_RestakeTokens:
	$(MAKE) _run_test TEST_NAME=RestakeTokens

.PHONY: run_test_SendTokens
run_test_SendTokens:
	$(MAKE) _run_test TEST_NAME=SendTokens

.PHONY: run_test_TokenApprove
run_test_TokenApprove:
	$(MAKE) _run_test TEST_NAME=TokenApprove