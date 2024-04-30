.PHONY: prepare
prepare:
	yarn install
	yarn build

.PHONY: run_node
run_node:
	npx hardhat node --port 8546 --hostname 127.0.0.1

.PHONY: run_test
run_test:
	npx hardhat test test/e2e/$(TEST_NAME).js

.PHONY: run_test_RestakeTokens
run_test_RestakeTokens:
	$(MAKE) run_test TEST_NAME=RestakeTokens

.PHONY: run_test_SendTokens
run_test_SendTokens:
	$(MAKE) run_test TEST_NAME=SendTokens