runtestdir = \
       @ls $(1)/*.coffee | xargs \
       ./node_modules/.bin/mocha --compilers coffee:coffee-script -u $(2) --colors

build-addon:
	@./node_modules/.bin/node-gyp configure
	@./node_modules/.bin/node-gyp build

test: build-addon
	$(call runtestdir, "./test", "tdd")

clean:
	@./node_modules/.bin/node-gyp clean

.PHONY: test build-addon clean
