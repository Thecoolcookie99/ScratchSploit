// ==UserScript==
// @name          Scratch Broadcast and Custom Block Executor
// @namespace     http://tampermonkey.net/
// @version       1.9
// @description   Sends custom broadcast messages on Scratch projects with an automatically updating, custom-styled, and smoothly draggable dropdown.
// @author        theSEAT_
// @match         https://scratch.mit.edu/projects/*
// @grant         none
// @run-at        document-end
// ==/UserScript==

(function() {
	'use strict';

	function injectCSS() {
		const style = document.createElement('style');
		style.type = 'text/css';
		style.textContent = `

            select {
                -webkit-appearance: none;
                -moz-appearance: none;
                appearance: none;
                background-image: none;
                border: none;
                padding-right: 25px;
                color: #333;
                font-family: 'Inter', 'Segoe UI', sans-serif;
            }

           .custom-select-wrapper {
                position: relative;
                display: flex;
                flex-grow: 1;
                border: 1px solid #ccc;
                border-radius: 8px;
                background-color: white;
                overflow: hidden;
                transition: border-color 0.2s ease, box-shadow 0.2s ease;
            }

           .custom-select-wrapper::after {
                content: '▼';
                font-size: 14px;
                color: #888;
                position: absolute;
                right: 10px;
                top: 50%;
                transform: translateY(-50%);
                pointer-events: none;
            }

           .custom-select-wrapper:focus-within {
                border-color: #0e86d0;
                box-shadow: 0 0 0 2px rgba(14, 134, 208, 0.2);
            }

            select option {
                padding: 5px 10px;
                color: #333;
                background-color: white;
            }

            select option[disabled][selected] {
                color: #888;
            }
        `;
		document.head.appendChild(style);
	}

	function findScratchVM() {
		const app = document.getElementById('app');
		if (!app || !app._reactRootContainer || !app._reactRootContainer._internalRoot) {
			console.warn('Broadcast Sender: React root not found.');
			return null;
		}

		let node = app._reactRootContainer._internalRoot.current;
		let attempts = 0;
		while (node && attempts < 100) {
			if (node.pendingProps && node.pendingProps.store && node.pendingProps.store.getState) {
				const vm = node.pendingProps.store.getState().scratchGui?.vm;
				if (vm) {
					console.log('Broadcast Sender: Scratch VM found!', vm);
					return vm;
				}
			}
			node = node.child;
			attempts++;
		}
		console.error('Broadcast Sender: Scratch VM not found after traversing React tree.');
		return null;
	}

	const vm = findScratchVM();

	if (!vm) {
		console.error('Broadcast Sender: Cannot proceed without the Scratch VM. The tool will not be loaded.');
		return;
	}

	injectCSS();

	const ui = document.createElement('div');
	Object.assign(ui.style, {
		position: 'fixed',
		top: '60px',
		right: '350px',
		width: '320px',
		backgroundColor: '#f8f8f8',
		border: '2px solid #bbb',
		borderRadius: '10px',
		boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
		fontFamily: 'Inter, Segoe UI, sans-serif',
		zIndex: 9998,
		overflow: 'hidden',
		transition: 'max-height 0.3s ease',
		maxHeight: '40px',

	});

	const header = document.createElement('div');
	header.textContent = '📣 Broadcast Sender';
	Object.assign(header.style, {
		backgroundColor: '#27ae60',
		color: 'white',
		padding: '10px',
		cursor: 'grab',
		fontWeight: 'bold',
		borderTopLeftRadius: '8px',
		borderTopRightRadius: '8px',
		userSelect: 'none',
		textAlign: 'center',
	});
	ui.appendChild(header);

	const content = document.createElement('div');
	Object.assign(content.style, {
		padding: '12px',
		display: 'none',
		flexDirection: 'column',
		gap: '12px',
	});

	const broadcastInputLabel = document.createElement('label');
	broadcastInputLabel.textContent = 'Broadcast Message:';
	broadcastInputLabel.style.fontSize = '13px';
	broadcastInputLabel.style.color = '#333';

	const broadcastInputContainer = document.createElement('div');
	Object.assign(broadcastInputContainer.style, {
		display: 'flex',
		alignItems: 'center',
		gap: '5px'
	});

	const customSelectWrapper = document.createElement('div');
	customSelectWrapper.classList.add('custom-select-wrapper');
	Object.assign(customSelectWrapper.style, {
		flexGrow: '1',
	});

	const broadcastSelect = document.createElement('select');
	Object.assign(broadcastSelect.style, {
		flexGrow: '1',
		padding: '8px',
		backgroundColor: 'transparent',
		borderRadius: '8px',
		fontSize: '14px',
		cursor: 'pointer',
		outline: 'none',
	});

	const defaultOption = document.createElement('option');
	defaultOption.value = '';
	defaultOption.textContent = 'Select a broadcast...';
	defaultOption.disabled = true;
	defaultOption.selected = true;
	broadcastSelect.appendChild(defaultOption);

	const sendBtn = document.createElement('button');
	sendBtn.textContent = 'Send Broadcast';
	Object.assign(sendBtn.style, {
		padding: '10px 14px',
		border: 'none',
		borderRadius: '8px',
		cursor: 'pointer',
		backgroundColor: '#3498db',
		color: 'white',
		fontWeight: 'bold',
		fontSize: '14px',
		transition: 'background-color 0.2s ease, transform 0.1s ease',
		boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
	});
	sendBtn.onmouseenter = () => sendBtn.style.filter = 'brightness(90%)';
	sendBtn.onmouseleave = () => sendBtn.style.filter = 'brightness(100%)';

	const msgDiv = document.createElement('div');
	Object.assign(msgDiv.style, {
		marginTop: '5px',
		fontSize: '13px',
		textAlign: 'center',
		height: '18px',
		color: '#333',
		transition: 'opacity 0.4s ease',
		opacity: 0
	});

	customSelectWrapper.append(broadcastSelect);
	broadcastInputContainer.append(customSelectWrapper);
	content.append(broadcastInputLabel, broadcastInputContainer, sendBtn, msgDiv);

	const customBlockRunnerDiv = document.createElement('div');
	Object.assign(customBlockRunnerDiv.style, {
		marginTop: '15px',
		backgroundColor: '#f0f0f0',
		border: '1px solid #ccc',
		borderRadius: '8px',
		boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
		overflow: 'hidden',
		maxHeight: '40px',
		transition: 'max-height 0.3s ease',
	});

	const customBlockRunnerHeader = document.createElement('div');
	customBlockRunnerHeader.textContent = '⚙️ CUSTOM BLOCK RUNNER';
	Object.assign(customBlockRunnerHeader.style, {
		backgroundColor: '#e67e22',
		color: 'white',
		padding: '10px',
		cursor: 'grab',
		fontWeight: 'bold',
		borderTopLeftRadius: '7px',
		borderTopRightRadius: '7px',
		userSelect: 'none',
		textAlign: 'center',
	});
	customBlockRunnerDiv.appendChild(customBlockRunnerHeader);

	const customBlockRunnerContent = document.createElement('div');
	Object.assign(customBlockRunnerContent.style, {
		padding: '12px',
		display: 'none',
		flexDirection: 'column',
		gap: '12px',
	});

	const spriteSelectLabel = document.createElement('label');
	spriteSelectLabel.textContent = 'Select a sprite:';
	Object.assign(spriteSelectLabel.style, {
		fontSize: '13px',
		color: '#333'
	});

	const spriteSelectWrapper = document.createElement('div');
	spriteSelectWrapper.classList.add('custom-select-wrapper');
	const spriteSelect = document.createElement('select');
	Object.assign(spriteSelect.style, {
		flexGrow: '1',
		padding: '8px',
		backgroundColor: 'transparent',
		borderRadius: '8px',
		fontSize: '14px',
		cursor: 'pointer',
		outline: 'none',
	});
	const defaultSpriteOption = document.createElement('option');
	defaultSpriteOption.value = '';
	defaultSpriteOption.textContent = 'Select a sprite...';
	defaultSpriteOption.disabled = true;
	defaultSpriteOption.selected = true;
	spriteSelect.appendChild(defaultSpriteOption);
	spriteSelectWrapper.append(spriteSelect);

	const customBlockSelectLabel = document.createElement('label');
	customBlockSelectLabel.textContent = 'Select a custom block:';
	Object.assign(customBlockSelectLabel.style, {
		fontSize: '13px',
		color: '#333'
	});

	const customBlockSelectWrapper = document.createElement('div');
	customBlockSelectWrapper.classList.add('custom-select-wrapper');
	const customBlockSelect = document.createElement('select');
	Object.assign(customBlockSelect.style, {
		flexGrow: '1',
		padding: '8px',
		backgroundColor: 'transparent',
		borderRadius: '8px',
		fontSize: '14px',
		cursor: 'pointer',
		outline: 'none',
	});
	const defaultCustomBlockOption = document.createElement('option');
	defaultCustomBlockOption.value = '';
	defaultCustomBlockOption.textContent = 'Select a custom block...';
	defaultCustomBlockOption.disabled = true;
	defaultCustomBlockOption.selected = true;
	customBlockSelect.appendChild(defaultCustomBlockOption);
	customBlockSelectWrapper.append(customBlockSelect);

	const customBlockDataSectionLabel = document.createElement('label');
	customBlockDataSectionLabel.textContent = '## CUSTOM BLOCK DATA SECTION ##';
	Object.assign(customBlockDataSectionLabel.style, {
		fontSize: '13px',
		color: '#333',
		fontWeight: 'bold',
		marginTop: '10px'
	});
	const customBlockDataSection = document.createElement('div');
	Object.assign(customBlockDataSection.style, {
		display: 'flex',
		flexDirection: 'column',
		gap: '8px',
		padding: '8px',
		border: '1px dashed #ddd',
		borderRadius: '5px',
		backgroundColor: '#fdfdfd'
	});

	const runCustomBlockBtn = document.createElement('button');
	runCustomBlockBtn.textContent = 'Run Custom Block';
	Object.assign(runCustomBlockBtn.style, {
		padding: '10px 14px',
		border: 'none',
		borderRadius: '8px',
		cursor: 'pointer',
		backgroundColor: '#e67e22',
		color: 'white',
		fontWeight: 'bold',
		fontSize: '14px',
		transition: 'background-color 0.2s ease, transform 0.1s ease',
		boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
	});
	runCustomBlockBtn.onmouseenter = () => runCustomBlockBtn.style.filter = 'brightness(90%)';
	runCustomBlockBtn.onmouseleave = () => runCustomBlockBtn.style.filter = 'brightness(100%)';

	const customBlockMsgDiv = document.createElement('div');
	Object.assign(customBlockMsgDiv.style, {
		marginTop: '5px',
		fontSize: '13px',
		textAlign: 'center',
		height: '18px',
		color: '#333',
		transition: 'opacity 0.4s ease',
		opacity: 0
	});

	customBlockRunnerContent.append(
		spriteSelectLabel, spriteSelectWrapper,
		customBlockSelectLabel, customBlockSelectWrapper,
		customBlockDataSectionLabel, customBlockDataSection,
		runCustomBlockBtn, customBlockMsgDiv
	);
	customBlockRunnerDiv.appendChild(customBlockRunnerContent);

	content.append(customBlockRunnerDiv);
	ui.appendChild(content);
	document.body.append(ui);

	function showMessage(msg, color = 'black') {
		msgDiv.textContent = msg;
		msgDiv.style.color = color;
		msgDiv.style.opacity = 1;
		clearTimeout(msgDiv._timeout);
		msgDiv._timeout = setTimeout(() => msgDiv.style.opacity = 0, 3500);
	}

	function populateBroadcasts() {
		const currentSelectedValue = broadcastSelect.value;

		while (broadcastSelect.options.length > 1) {
			broadcastSelect.remove(1);
		}

		const uniqueBroadcasts = new Set();
		let broadcasts = [];
		if (vm.runtime.getAllBroadcasts) {
			broadcasts = vm.runtime.getAllBroadcasts();
			broadcasts.forEach(broadcast => uniqueBroadcasts.add(broadcast.name));
		}

		vm.runtime.targets.forEach(target => {
			if (target.blocks) {
				for (const blockId in target.blocks._blocks) {
					const block = target.blocks._blocks[blockId];
					if (!block) continue;

					if (block.opcode === 'event_whenbroadcastreceived' && block.fields?.BROADCAST_OPTION) {
						uniqueBroadcasts.add(block.fields.BROADCAST_OPTION.value);
					} else if ((block.opcode === 'event_broadcast' ||
							block.opcode === 'event_broadcastandwait') && block.inputs?.BROADCAST_OPTION) {
						const input = block.inputs.BROADCAST_OPTION;
						if (input && input.block && target.blocks._blocks[input.block]) {
							const broadcastBlock = target.blocks._blocks[input.block];
							if (broadcastBlock) {
								const value = broadcastBlock.fields?.BROADCAST_OPTION ?
									broadcastBlock.fields.BROADCAST_OPTION.value :
									broadcastBlock.fields?.TEXT?.value;
								if (value) uniqueBroadcasts.add(value);
							}
						}
					}
				}
			}
		});

		if (uniqueBroadcasts.size > 0) {
			Array.from(uniqueBroadcasts).sort().forEach(msg => {
				const option = document.createElement('option');
				option.value = msg;
				option.textContent = msg;
				broadcastSelect.appendChild(option);
			});
			if (currentSelectedValue && uniqueBroadcasts.has(currentSelectedValue)) {
				broadcastSelect.value = currentSelectedValue;
			} else {
				broadcastSelect.value = '';
			}
		} else {
			const emptyOption = document.createElement('option');
			emptyOption.value = '';
			emptyOption.textContent = 'No broadcasts found';
			emptyOption.disabled = true;
			broadcastSelect.appendChild(emptyOption);
			broadcastSelect.value = '';
		}
	}

	header.onclick = () => {
		const isExpanded = content.style.display === 'flex';
		content.style.display = isExpanded ? 'none' : 'flex';

		ui.style.maxHeight = isExpanded ? '40px' : '700px';

		if (!isExpanded) {
			populateBroadcasts();
		}
	};

	sendBtn.onclick = () => {
		const message = broadcastSelect.value;

		if (!message) {
			showMessage('Please select a broadcast message.', 'orange');
			return;
		}

		try {
			vm.runtime.startHats('event_whenbroadcastreceived', null, null, message);
			showMessage(`✅ Broadcast '${message}' sent!`, 'green');
			console.log(`Broadcast Sender: Sent broadcast '${message}'.`);
		} catch (e) {
			showMessage(`❌ Error sending broadcast: ${e.message}`, 'red');
			console.error('Broadcast Sender - Error sending broadcast:', e);
		}
	};

	broadcastSelect.addEventListener('keypress', (e) => {
		if (e.key === 'Enter') {
			sendBtn.click();
		}
	});

	let autoUpdateInterval;

	header.addEventListener('click', () => {
		const isExpanded = content.style.display === 'flex';
		if (!isExpanded) {
			if (autoUpdateInterval) clearInterval(autoUpdateInterval);
			autoUpdateInterval = setInterval(populateBroadcasts, 100);
			console.log("Broadcast Sender: Auto-update started (100ms interval).");
		} else {
			if (autoUpdateInterval) {
				clearInterval(autoUpdateInterval);
				autoUpdateInterval = null;
				console.log("Broadcast Sender: Auto-update stopped.");
			}
		}
	});

	let selectedTarget = null;
	let selectedCustomBlockDefinition = null;

	function showCustomBlockMessage(msg, color = 'black') {
		customBlockMsgDiv.textContent = msg;
		customBlockMsgDiv.style.color = color;
		customBlockMsgDiv.style.opacity = 1;
		clearTimeout(customBlockMsgDiv._timeout);
		customBlockMsgDiv._timeout = setTimeout(() => customBlockMsgDiv.style.opacity = 0, 3500);
	}

	function populateSprites() {
		const currentSelectedSpriteId = spriteSelect.value;
		while (spriteSelect.options.length > 1) {
			spriteSelect.remove(1);
		}

		const targets = vm.runtime.targets;
		if (targets.length === 0) {
			const emptyOption = document.createElement('option');
			emptyOption.value = '';
			emptyOption.textContent = 'No sprites found';
			emptyOption.disabled = true;
			spriteSelect.appendChild(emptyOption);
			spriteSelect.value = '';
			return;
		}

		targets.forEach(target => {
			if (target && target.sprite) {
				const option = document.createElement('option');
				option.value = target.id;

				option.textContent = target.isStage ? 'Stage' : target.sprite.name;
				spriteSelect.appendChild(option);
			}
		});

		if (currentSelectedSpriteId && targets.some(t => t.id === currentSelectedSpriteId)) {
			spriteSelect.value = currentSelectedSpriteId;

			populateCustomBlocks(currentSelectedSpriteId);
		} else {
			spriteSelect.value = '';
			clearCustomBlockDropdown();
			clearCustomBlockInputs();
		}
	}

	function clearCustomBlockDropdown() {
		while (customBlockSelect.options.length > 1) {
			customBlockSelect.remove(1);
		}
		const emptyOption = document.createElement('option');
		emptyOption.value = '';
		emptyOption.textContent = 'Select a custom block...';
		emptyOption.disabled = true;
		emptyOption.selected = true;
		customBlockSelect.appendChild(emptyOption);
		customBlockSelect.value = '';
		selectedCustomBlockDefinition = null;
	}

	function clearCustomBlockInputs() {
		customBlockDataSection.innerHTML = '';
	}

	const customBlockDefinitions = new Map();

	function populateCustomBlocks(targetId) {
		clearCustomBlockDropdown();
		clearCustomBlockInputs();
		customBlockDefinitions.clear();

		selectedTarget = vm.runtime.targets.find(t => t.id === targetId);
		if (!selectedTarget || !selectedTarget.blocks) {
			showCustomBlockMessage('Selected sprite has no blocks.', 'orange');
			return;
		}

		let foundCustomBlocks = false;
		for (const blockId in selectedTarget.blocks._blocks) {
			const block = selectedTarget.blocks._blocks[blockId];

			if (block && block.opcode === 'procedures_prototype' && block.mutation) {
				const proccode = block.mutation.proccode;
				if (proccode) {
					const option = document.createElement('option');
					option.value = proccode;
					option.textContent = proccode;
					customBlockSelect.appendChild(option);
					foundCustomBlocks = true;

					customBlockDefinitions.set(proccode, {
						id: block.id,
						proccode: proccode,
						argumentids: block.mutation.argumentids || [],
						argumentnames: block.mutation.argumentnames || [],
						argumentdefaults: block.mutation.argumentdefaults || [],
						warp: block.mutation.warp === 'true'
					});
				}
			}
		}

		if (!foundCustomBlocks) {
			const emptyOption = document.createElement('option');
			emptyOption.value = '';
			emptyOption.textContent = 'No custom blocks found for this sprite';
			emptyOption.disabled = true;
			customBlockSelect.appendChild(emptyOption);
			customBlockSelect.value = '';
		} else {
			customBlockSelect.value = '';
		}
	}

	function generateCustomBlockInputs(proccode) {
		clearCustomBlockInputs();
		selectedCustomBlockDefinition = customBlockDefinitions.get(proccode);

		if (!selectedCustomBlockDefinition) {
			showCustomBlockMessage('Custom block definition not found.', 'red');
			return;
		}

		const {
			proccode: blockProccode,
			argumentnames,
			argumentdefaults
		} = selectedCustomBlockDefinition;

		const parts = blockProccode.split(/(%s|%b)/);
		let argIndex = 0;

		parts.forEach(part => {
			if (part === '%s' |
				part === '%s' || part === '%b') {
				const argName = argumentnames[argIndex] || `val${argIndex + 1}`;
				const argDefault = argumentdefaults[argIndex] || '';

				const inputContainer = document.createElement('div');
				Object.assign(inputContainer.style, {
					display: 'flex',
					alignItems: 'center',
					gap: '5px'
				});

				const label = document.createElement('span');
				label.textContent = `${argName}:`;
				Object.assign(label.style, {
					fontSize: '13px',
					color: '#555'
				});

				let inputElement;
				if (part === '%b') {
					inputElement = document.createElement('input');
					inputElement.type = 'checkbox';
					inputElement.checked = argDefault === 'true';
					Object.assign(inputElement.style, {
						width: '20px',
						height: '20px'
					});
				} else {
					inputElement = document.createElement('input');
					inputElement.type = 'text';
					inputElement.value = argDefault;
					Object.assign(inputElement.style, {
						flexGrow: '1',
						padding: '6px',
						border: '1px solid #ddd',
						borderRadius: '4px',
						fontSize: '13px',
						outline: 'none'
					});
					inputElement.onfocus = (e) => e.target.style.borderColor = '#0e86d0';
					inputElement.onblur = (e) => e.target.style.borderColor = '#ddd';
				}
				inputElement.dataset.argName = argName;
				inputElement.dataset.argType = part;

				inputContainer.append(label, inputElement);
				customBlockDataSection.appendChild(inputContainer);
				argIndex++;
			} else if (part.trim() !== '') {

				const textSpan = document.createElement('span');
				textSpan.textContent = part.trim();
				Object.assign(textSpan.style, {
					fontSize: '13px',
					color: '#555'
				});
				customBlockDataSection.appendChild(textSpan);
			}
		});

		if (argIndex === 0) {
			const noInputsText = document.createElement('span');
			noInputsText.textContent = 'This custom block has no inputs.';
			Object.assign(noInputsText.style, {
				fontSize: '13px',
				color: '#888',
				textAlign: 'center'
			});
			customBlockDataSection.appendChild(noInputsText);
		}
	}

	runCustomBlockBtn.onclick = () => {
		if (!selectedTarget) {
			showCustomBlockMessage('Please select a sprite first.', 'orange');
			console.debug('Custom Block Runner: No sprite selected');
			return;
		}
		if (!selectedCustomBlockDefinition) {
			showCustomBlockMessage('Please select a custom block first.', 'orange');
			console.debug('Custom Block Runner: No custom block selected');
			return;
		}

		console.debug('Custom Block Runner: Selected sprite:', selectedTarget.sprite.name);
		console.debug('Custom Block Runner: Selected block:', selectedCustomBlockDefinition);

		const args = [];
		customBlockDataSection.querySelectorAll('input').forEach(input => {
			const argType = input.dataset.argType;
			const argName = input.dataset.argName; // <-- Make sure this line exists!
			let value;

			if (argType === '%b') {
				value = input.checked;
			} else {
				value = input.value;
			}
			args.push(value);
			console.debug(`Custom Block Runner: Argument "${argName}" = "${value}"`);
		});

		// Find the actual procedure definition block
		let definitionBlock = null;
		for (const blockId in selectedTarget.blocks._blocks) {
			const block = selectedTarget.blocks._blocks[blockId];
			if (block && block.opcode === 'procedures_definition') {
				const prototypeId = block.inputs.custom_block?.block;
				if (prototypeId === selectedCustomBlockDefinition.id) {
					definitionBlock = block;
					break;
				}
			}
		}

		if (!definitionBlock) {
			showCustomBlockMessage('❌ Could not find custom block implementation.', 'red');
			return;
		}

		try {
			// Verify the block exists in the target
			const blockId = selectedCustomBlockDefinition.id;
			if (!selectedTarget.blocks._blocks[blockId]) {
				throw new Error('Custom block definition not found in sprite');
			}

			console.debug('Custom Block Runner: Starting execution with:', {
				blockId,
				targetName: selectedTarget.sprite.name,
				arguments: args
			});

			// Create a unique block ID
			const callBlockId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

			// Build the inputs object
			const inputs = {};
			// Find the actual procedure definition block
			let definitionBlock2 = null;
			for (const blockId in selectedTarget.blocks._blocks) {
				const block = selectedTarget.blocks._blocks[blockId];
				if (block && block.opcode === 'procedures_definition') {
					const prototypeId = block.inputs.custom_block?.block;
					if (prototypeId === selectedCustomBlockDefinition.id) {
						definitionBlock2 = block;
						break;
					}
				}
			}

			if (!definitionBlock2) {
				showCustomBlockMessage('❌ Could not find custom block implementation.', 'red');
				return;
			}

			// --- FIXES & VALIDATION for Scratch/Blockly compatibility ---
        // Parse argumentids, argumentnames, argumentdefaults as arrays
        let argumentIds = selectedCustomBlockDefinition.argumentids;
        let argumentNames = selectedCustomBlockDefinition.argumentnames;
        let argumentDefaults = selectedCustomBlockDefinition.argumentdefaults;
        if (typeof argumentIds === "string") argumentIds = JSON.parse(argumentIds);
        if (typeof argumentNames === "string") argumentNames = JSON.parse(argumentNames);
        if (typeof argumentDefaults === "string") argumentDefaults = JSON.parse(argumentDefaults);
        if (!Array.isArray(argumentIds)) argumentIds = [];
        if (!Array.isArray(argumentNames)) argumentNames = [];
        if (!Array.isArray(argumentDefaults)) argumentDefaults = [];

        // Collect values in the same order as argumentNames, fallback to defaults
        const argValues = [];
        argumentNames.forEach((argName, i) => {
            const input = customBlockDataSection.querySelector(`input[data-arg-name="${argName}"]`);
            let value;
            if (input) {
                value = input.dataset.argType === '%b' ? input.checked : input.value;
            } else {
                value = argumentDefaults[i] !== undefined ? argumentDefaults[i] : "";
            }
            argValues.push(value);
            console.debug(`Custom Block Runner: Argument (ordered) "${argName}" = "${value}"`);
        });

        // Build inputs object by index, ensure all IDs are present
        for (let key in inputs) { delete inputs[key]; }
        argumentIds.forEach((argId, i) => {
            // If value is undefined, fallback to default
            let value = argValues[i];
            if (value === undefined) value = argumentDefaults[i] !== undefined ? argumentDefaults[i] : "";
            // For booleans, ensure value is boolean
            if (typeof value === 'string' && value !== '' && argumentDefaults[i] === 'true') value = (value === 'true' || value === true);
            inputs[argId] = [1, value];
        });

        // --- END FIXES ---

			selectedTarget.blocks._blocks[callBlockId] = {
				id: callBlockId,
				opcode: 'procedures_call',
				inputs: inputs, // <-- Use the constructed inputs object
				fields: {},
				next: null,
				parent: null,
				shadow: false,
				x: 0,
				y: 0,
				mutation: {
					tagName: 'mutation',
					children: [],
					proccode: selectedCustomBlockDefinition.proccode,
					argumentids: JSON.stringify(argumentIds),
					argumentnames: JSON.stringify(argumentNames),
					argumentdefaults: JSON.stringify(argumentDefaults),
					warp: selectedCustomBlockDefinition.warp
				}
			};

			// Execute the procedure call
			vm.runtime._pushThread(callBlockId, selectedTarget);

			console.debug('Custom Block Runner: Execution started successfully');

			showCustomBlockMessage(`✅ Custom block '${selectedCustomBlockDefinition.proccode}' run on '${selectedTarget.sprite.name}'!`, 'green');
		} catch (e) {
			const errorMessage = `Error: ${e.message}`;
			showCustomBlockMessage(`❌ ${errorMessage}`, 'red');
			console.error('Custom Block Runner - Detailed error:', {
				error: e,
				sprite: selectedTarget?.sprite?.name,
				blockDefinition: selectedCustomBlockDefinition,
				arguments: args
			});
		}
	};

	customBlockRunnerHeader.onclick = () => {
		const isExpanded = customBlockRunnerContent.style.display === 'flex';
		customBlockRunnerContent.style.display = isExpanded ? 'none' : 'flex';
		customBlockRunnerDiv.style.maxHeight = isExpanded ? '40px' : '500px';

		if (!isExpanded) {
			populateSprites();
		}
	};

	spriteSelect.onchange = (e) => {
		const targetId = e.target.value;
		populateCustomBlocks(targetId);
	};

	customBlockSelect.onchange = (e) => {
		const proccode = e.target.value;
		generateCustomBlockInputs(proccode);
	};

	let isDragging = false;
	let offsetX = 0;
	let offsetY = 0;

	header.addEventListener('pointerdown', dragStart);
	customBlockRunnerHeader.addEventListener('pointerdown', dragStart);

	function dragStart(e) {

		e.preventDefault();

		if (e.button !== 0) return;

		isDragging = true;

		if (e.target === header) {
			header.style.cursor = 'grabbing';
		} else if (e.target === customBlockRunnerHeader) {
			customBlockRunnerHeader.style.cursor = 'grabbing';
		}

		const computedStyle = window.getComputedStyle(ui);
		let currentLeft = parseFloat(computedStyle.left);
		let currentTop = parseFloat(computedStyle.top);
		let currentRight = parseFloat(computedStyle.right);

		if (isNaN(currentLeft) || computedStyle.left === 'auto') {
			currentLeft = document.documentElement.clientWidth - ui.offsetWidth - currentRight;
			ui.style.left = currentLeft + 'px';
			ui.style.right = 'auto';
		}

		offsetX = e.clientX - currentLeft;
		offsetY = e.clientY - currentTop;

		document.addEventListener('pointermove', drag);
		document.addEventListener('pointerup', dragEnd);
	}

	function drag(e) {
		if (!isDragging) return;

		e.preventDefault();

		let newLeft = e.clientX - offsetX;
		let newTop = e.clientY - offsetY;

		ui.style.left = newLeft + 'px';
		ui.style.top = newTop + 'px';
	}

	function dragEnd(e) {
		isDragging = false;
		header.style.cursor = 'grab';
		customBlockRunnerHeader.style.cursor = 'grab';

		document.removeEventListener('pointermove', drag);
		document.removeEventListener('pointerup', dragEnd);
	}

})();